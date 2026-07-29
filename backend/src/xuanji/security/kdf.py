from argon2.low_level import Type, hash_secret_raw

from xuanji.security.models import KDFParameters


DEFAULT_KDF_PARAMETERS = KDFParameters(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
)


def derive_key(password: str, salt: bytes, parameters: KDFParameters) -> bytes:
    return hash_secret_raw(
        secret=password.encode("utf-8"),
        salt=salt,
        time_cost=parameters.time_cost,
        memory_cost=parameters.memory_cost,
        parallelism=parameters.parallelism,
        hash_len=parameters.key_length,
        type=Type.ID,
    )
