from app.celery_app import celery_app
import logging

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, name="tasks.extract_concepts")
def extract_concepts(self, document_id: int, api_key: str) -> dict:
    """
    Extract key concepts from a document.
    Delegated to generate_outline task — this stub exists for independent scheduling.
    """
    logger.info("Extracting concepts for document %s", document_id)
    return {"document_id": document_id, "status": "delegated_to_generate_outline"}
