from app.celery_app import celery_app
from app.services.llm import chat_completion
import asyncio
import json
import logging

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, name="tasks.generate_outline")
def generate_outline(self, document_id: int, api_key: str, model: str = "openai/gpt-4o-mini") -> dict:
    """
    Generate outline and concepts for a document.
    Requires the document's text content to already be extracted (Phase 1.1).
    This is a stub — text retrieval from DB not yet implemented.
    """
    logger.info("Generating outline for document %s", document_id)

    # Stub: in Phase 1.1, retrieve actual document text from document_sections
    stub_text = f"[Document {document_id} text not yet extracted — Phase 1.1 required]"

    messages = [
        {
            "role": "system",
            "content": (
                "You are a scientific paper analyst. Given the full text of a paper, "
                "return a JSON object with two keys: "
                "'outline' (array of {title, pageStart, summary}) and "
                "'concepts' (array of {term, definition}). "
                "Return ONLY valid JSON, no markdown."
            ),
        },
        {"role": "user", "content": f"Paper text:\n\n{stub_text}"},
    ]

    try:
        result = asyncio.run(chat_completion(api_key=api_key, model=model, messages=messages))
        content = result["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        return {"document_id": document_id, "outline": parsed.get("outline", []), "concepts": parsed.get("concepts", [])}
    except Exception as e:
        logger.error("Failed to generate outline for document %s: %s", document_id, e)
        raise self.retry(exc=e, countdown=60, max_retries=3)
