import os
import yaml
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent
load_dotenv(BASE_DIR / ".env")

_config = None

def get_config() -> dict:
    global _config
    if _config is None:
        with open(BASE_DIR / "config.yaml", "r") as f:
            _config = yaml.safe_load(f)
    return _config

def get_provider_config(provider_name: str) -> dict:
    config = get_config()
    providers = config.get("providers", {})
    if provider_name not in providers:
        raise ValueError(f"Unknown provider: {provider_name}")
    return providers[provider_name]

def get_api_key(provider_name: str) -> str:
    provider = get_provider_config(provider_name)
    env_var = provider.get("api_key_env", "")
    api_key = os.getenv(env_var, "")
    if not api_key:
        raise ValueError(f"API key not set: {env_var} (in .env file)")
    return api_key

def get_model_config(config_key: str = "planner") -> tuple[str, str, str, dict]:
    """返回 (base_url, api_key, model, params)"""
    config = get_config()
    planner = config.get(config_key, config.get("planner"))
    
    provider_name = planner["provider"]
    model = planner["model"]
    provider = get_provider_config(provider_name)
    api_key = get_api_key(provider_name)
    base_url = provider["base_url"]
    
    params = {
        "temperature": planner.get("temperature", 0.7),
        "max_tokens": planner.get("max_tokens", 4096),
    }
    
    return base_url, api_key, model, params
