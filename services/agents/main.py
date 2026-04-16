from contextlib import asynccontextmanager
from fastapi import FastAPI
from deps.db import init_pool, close_pool
from routers import health, embeddings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(lifespan=lifespan)
app.include_router(health.router)
app.include_router(embeddings.router)
