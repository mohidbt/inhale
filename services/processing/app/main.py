from fastapi import FastAPI
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.routers import health, rag


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup: create async engine
    app.state.engine = create_async_engine(settings.database_url)
    app.state.async_session = sessionmaker(
        app.state.engine, class_=AsyncSession, expire_on_commit=False
    )
    yield
    # shutdown: dispose engine
    await app.state.engine.dispose()


app = FastAPI(title="Inhale Processing Service", lifespan=lifespan)
app.include_router(health.router)
app.include_router(rag.router)
