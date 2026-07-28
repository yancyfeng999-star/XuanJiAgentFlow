from __future__ import annotations

import hashlib

import httpx
import pytest

from tests.fakes.fake_node import FakeNode, FakeNodeMode
from xuanji.nodes import NodeClient, NodeConnectionError


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("mode", "expected_status"),
    [
        (FakeNodeMode.SUCCESS, "success"),
        (FakeNodeMode.FAILURE, "failed"),
    ],
)
async def test_fake_node_reports_real_success_and_failure_modes(mode: FakeNodeMode, expected_status: str) -> None:
    with FakeNode(mode) as fake:
        async with fake.client() as transport_client:
            client = NodeClient("http://fake-node", fake.token, client=transport_client)
            created = await client.create_task("goal", "dispatch-1")
            completed = await client.get_task(created.id)

        assert created.status == "running"
        assert completed.status == expected_status
        assert completed.hermes_run_id == "hermes-dispatch-1"


@pytest.mark.asyncio
async def test_fake_node_delay_idempotency_and_cancel_are_stateful() -> None:
    with FakeNode(FakeNodeMode.DELAY, delay_polls=2) as fake:
        async with fake.client() as transport_client:
            client = NodeClient("http://fake-node", fake.token, client=transport_client)
            first = await client.create_task("first goal", "dispatch-delay")
            second = await client.create_task("changed goal", "dispatch-delay")
            assert (await client.get_task(first.id)).status == "running"
            assert (await client.get_task(first.id)).status == "running"
            assert (await client.cancel_task(first.id)).status == "cancelled"

        assert second.id == first.id
        assert fake.create_calls == 1
        assert fake.cancel_calls == 1
        assert fake.tasks[first.id].goal == "first goal"


@pytest.mark.asyncio
async def test_fake_node_offline_mode_raises_real_connection_error() -> None:
    with FakeNode(FakeNodeMode.OFFLINE) as fake:
        async with fake.client() as transport_client:
            client = NodeClient("http://fake-node", fake.token, client=transport_client)
            with pytest.raises(NodeConnectionError):
                await client.health()


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", [FakeNodeMode.SUCCESS, FakeNodeMode.BAD_HASH])
async def test_fake_node_artifact_transport_and_bad_hash(mode: FakeNodeMode) -> None:
    with FakeNode(mode) as fake:
        async with fake.client() as transport_client:
            client = NodeClient("http://fake-node", fake.token, client=transport_client)
            task = await client.create_task("artifact goal", "dispatch-artifact")
            assert (await client.get_task(task.id)).status == "success"
            artifact = (await client.artifacts(task.id)).artifacts[0]
            response = await transport_client.get(
                f"/v1/tasks/{task.id}/artifacts/{artifact.path}",
                headers={"Authorization": f"Bearer {fake.token}"},
            )

        actual_hash = hashlib.sha256(response.content).hexdigest()
        assert response.status_code == 200
        assert artifact.size == len(response.content)
        assert response.headers["x-artifact-size"] == str(artifact.size)
        assert response.headers["x-artifact-sha256"] == actual_hash
        if mode is FakeNodeMode.BAD_HASH:
            assert artifact.sha256 != actual_hash
        else:
            assert artifact.sha256 == actual_hash


@pytest.mark.asyncio
async def test_fake_node_requires_bearer_authentication() -> None:
    with FakeNode() as fake:
        async with fake.client() as client:
            assert (await client.get("/v1/health")).status_code == 401
            assert (await client.get("/v1/health", headers={"Authorization": fake.token})).status_code == 401
            assert (
                await client.get(
                    "/v1/health",
                    headers={"Authorization": f"Bearer {fake.token}"},
                )
            ).status_code == 200
