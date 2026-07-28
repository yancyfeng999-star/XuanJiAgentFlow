from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class KDFParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    algorithm: Literal["argon2id"] = "argon2id"
    time_cost: int = Field(ge=1, le=10)
    memory_cost: int = Field(ge=8192, le=1048576)
    parallelism: int = Field(ge=1, le=16)
    key_length: Literal[32] = 32


class VaultDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    kdf: KDFParameters
    salt: str
    nonce: str
    ciphertext: str
