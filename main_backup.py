import functions_framework, vertexai, uuid, os, json, base64
from vertexai.generative_models import GenerativeModel, Part
from google.cloud import storage, bigquery
from datetime import datetime, timezone

PROJECT_ID = os.environ.get("GCP_PROJECT", "duleetest")
LOCATION = os.environ.get("FUNCTION_REGION", "us-central1")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "")
BIGQUERY_DATASET = os.environ.get("BIGQUERY_DATASET", "")
BIGQUERY_TABLE = os.environ.get("BIGQUERY_TABLE", "")
MODEL_ID = os.environ.get("MODEL_ID", "")

storage_client = storage.Client(project=PROJECT_ID)
bigquery_client = bigquery.Client(project=PROJECT_ID)
vertexai.init(project=PROJECT_ID, location=LOCATION)

generative_model = GenerativeModel(MODEL_ID)

# --- 최종 프롬프트 (언어 및 내용 최적화) ---
enhanced_prompt = """
You are "Creator-GPT," an AI Creative Director at HS Ad. Your mission is to analyze the provided image of an LG Electronics product and generate a rich JSON object to power an automated content creation pipeline.

The JSON object MUST contain these six keys: "product_type", "color", "concepts", "alt_text", "marketing_copy", and "veo_prompt".

- "product_type": (Korean) The full, official product name.
- "color": (Korean) The primary, marketable color name.
- "concepts": (Korean) A mandatory array of 5-7 creative Korean marketing keywords.
- "marketing_copy": (Korean) A short, catchy, and inspiring marketing slogan or social media copy.

- "alt_text": (Rich Korean) CRITICAL - Write a long, detailed, and SEO-friendly description in KOREAN. Describe the product, its key features, the atmosphere of the image, and the target user's lifestyle. This text must be rich with keywords for maximum search visibility and accessibility.

- "veo_prompt": (Detailed English) CRITICAL - Write a detailed, high-quality video generation prompt in ENGLISH for an AI like VEO. This prompt must be specific, describing scenes, camera angles (e.g., close-up, wide shot), lighting (e.g., cinematic, soft light), and atmosphere (e.g., elegant, futuristic) to create a compelling 15-second 4K video ad. Include technical parameters like "--ar 16:9".

CRITICAL: Your response must be ONLY the raw JSON object.
"""

@functions_framework.http
def dam_orchestrator_with_search(request):
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json'}
    if request.method == 'OPTIONS': return ('', 204, headers)
    try:
        request_json = request.get_json(silent=True)
        action = request_json.get('action')
        if action == 'upload': return handle_upload(request_json, headers)
        elif action == 'search': return handle_search(request_json, headers)
        else: return ('{"error": "Invalid action specified."}', 400, headers)
    except Exception as e:
        print(f"Error: {e}"); error_payload = {"error": f"An unexpected error occurred: {str(e)}"}; return (json.dumps(error_payload), 500, headers)

def handle_upload(data, headers):
    image_bytes = base64.b64decode(data['image_data'].split(",")[1])
    asset_id = str(uuid.uuid4())
    image_blob_name = f"images/{asset_id}.png"
    image_path = f"gs://{BUCKET_NAME}/{image_blob_name}"
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(image_blob_name)
    blob.upload_from_string(image_bytes, content_type='image/png')
    response = generative_model.generate_content([Part.from_data(data=image_bytes, mime_type='image/png'), enhanced_prompt])
    metadata_raw = response.text.strip().replace('```json', '').replace('```', '')
    metadata = json.loads(metadata_raw)
    row_to_insert = { "asset_id": asset_id, "product_type": metadata.get("product_type"), "color": metadata.get("color"), "image_path": image_path, "created_at": datetime.now(timezone.utc).isoformat(), "concepts": json.dumps(metadata.get("concepts", [])), "alt_text": metadata.get("alt_text"), "marketing_copy": metadata.get("marketing_copy"), "veo_prompt": metadata.get("veo_prompt") }
    errors = bigquery_client.insert_rows_json(f"{PROJECT_ID}.{BIGQUERY_DATASET}.{BIGQUERY_TABLE}", [row_to_insert])
    if errors: raise Exception(f"BigQuery Insert Error: {errors}")
    return (json.dumps({"message": "자산이 성공적으로 분석 및 저장되었습니다!", "asset_id": asset_id}), 200, headers)

def handle_search(data, headers):
    query_text = data.get('text_query', '').strip()
    if not query_text: return ('{"error": "Search keyword is required."}', 400, headers)
    keywords = query_text.split()
    where_clauses = []
    for keyword in keywords:
        where_clauses.append(f"""( LOWER(t.product_type) LIKE '%{keyword.lower()}%' OR LOWER(t.color) LIKE '%{keyword.lower()}%' OR LOWER(t.alt_text) LIKE '%{keyword.lower()}%' OR LOWER(t.marketing_copy) LIKE '%{keyword.lower()}%' OR EXISTS(SELECT 1 FROM UNNEST(JSON_EXTRACT_STRING_ARRAY(t.concepts)) AS concept WHERE LOWER(concept) LIKE '%{keyword.lower()}%') )""")
    full_where_clause = " AND ".join(where_clauses)
    query = f""" SELECT t.asset_id, t.product_type, t.color, t.image_path, ANY_VALUE(t.concepts) as concepts, ANY_VALUE(t.alt_text) as alt_text, ANY_VALUE(t.marketing_copy) as marketing_copy, ANY_VALUE(t.veo_prompt) as veo_prompt, MAX(t.created_at) as created_at FROM `{PROJECT_ID}.{BIGQUERY_DATASET}.{BIGQUERY_TABLE}` AS t WHERE {full_where_clause} GROUP BY t.asset_id, t.product_type, t.color, t.image_path ORDER BY created_at DESC LIMIT 20 """
    query_job = bigquery_client.query(query)
    results = [dict(row) for row in query_job]
    for r in results:
        if isinstance(r.get('created_at'), datetime): r['created_at'] = r['created_at'].isoformat()
        if isinstance(r.get('concepts'), str): r['concepts'] = json.loads(r.get('concepts', '[]'))
    return (json.dumps(results), 200, headers)
