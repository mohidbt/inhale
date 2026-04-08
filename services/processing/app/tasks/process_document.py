from app.celery_app import celery_app
import logging

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, name="tasks.process_document")
def process_document(self, document_id: int) -> dict:
    """
    Pipeline: OCR → section split → chunking → embedding
    Full implementation in Phase 1.1 — this is a stub that logs and returns.
    """
    logger.info(f"Processing document {document_id}")
    return {"document_id": document_id, "status": "stub — not yet implemented"}
