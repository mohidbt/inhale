from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str = "redis://localhost:6379"
    environment: str = "development"

    model_config = {"env_file": ".env.local"}


settings = Settings()
