import functions_framework, vertexai, uuid, os, json, base64
from vertexai.generative_models import GenerativeModel, Part
from vertexai.vision_models import Image, MultiModalEmbeddingModel
from google.cloud import storage, bigquery, aiplatform
# [수정] 공식 문서에 명시된, 정확한 Datapoint 클래스를 임포트합니다.
from google.cloud.aiplatform_v1.types.index import IndexDatapoint
from datetime import datetime, timezone
import traceback

# --- 환경 변수 로드 ---
PROJECT_ID = os.environ.get("GCP_PROJECT", "")
LOCATION = os.environ.get("FUNCTION_REGION", "")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "")
BIGQUERY_DATASET = os.environ.get("BIGQUERY_DATASET", "")
BIGQUERY_TABLE = os.environ.get("BIGQUERY_TABLE", "")
MODEL_ID = os.environ.get("MODEL_ID", "")
VECTOR_SEARCH_ENDPOINT_ID = os.environ.get("VECTOR_SEARCH_ENDPOINT_ID", "")
VECTOR_SEARCH_INDEX_ID = os.environ.get("VECTOR_SEARCH_INDEX_ID", "")
DEPLOYED_INDEX_ID = os.environ.get("DEPLOYED_INDEX_ID", "")

# --- 클라이언트 초기화 ---
storage_client = storage.Client(project=PROJECT_ID)
bigquery_client = bigquery.Client(project=PROJECT_ID, location="US")
vertexai.init(project=PROJECT_ID, location=LOCATION)
aiplatform.init(project=PROJECT_ID, location=LOCATION)

generative_model = GenerativeModel(MODEL_ID)
embedding_model = MultiModalEmbeddingModel.from_pretrained("multimodalembedding@001")
vs_index_endpoint = aiplatform.MatchingEngineIndexEndpoint(index_endpoint_name=VECTOR_SEARCH_ENDPOINT_ID) if VECTOR_SEARCH_ENDPOINT_ID else None
vs_index = aiplatform.MatchingEngineIndex(index_name=VECTOR_SEARCH_INDEX_ID) if VECTOR_SEARCH_INDEX_ID else None

# --- 프롬프트 (변경 없음) ---
enhanced_prompt = """
You are "Creator-GPT," an AI Creative Director at HS Ad. Your mission is to analyze the provided image of an LG Electronics product and generate a rich JSON object. The JSON object MUST contain these six keys: "product_type", "color", "concepts", "alt_text", "marketing_copy", and "veo_prompt". - "product_type": (Korean) The full, official product name. - "color": (Korean) The primary, marketable color name. - "concepts": (Korean) A mandatory array of 5-7 creative Korean marketing keywords. - "marketing_copy": (Korean) A short, catchy, and inspiring marketing slogan or social media copy. - "alt_text": (Rich Korean) CRITICAL - Write a long, detailed, and SEO-friendly description in KOREAN. - "veo_prompt": (Detailed English) CRITICAL - Write a detailed, high-quality video generation prompt in ENGLISH for an AI like VEO. CRITICAL: Your response must be ONLY the raw JSON object.
"""
rag_prompt_template = """
You are "DAM-GPT", a helpful AI assistant for HS Ad's marketing team. Your task is to answer the user's question based *only* on the provided asset information. The asset information is given as a list of JSON objects. Analyze the data for the most relevant assets and formulate a helpful, concise, and friendly answer in Korean. If the data is insufficient, state that you cannot find relevant information in the current DAM. Do not make up information.
USER'S QUESTION: {question}
AVAILABLE ASSET DATA (JSON): {context}
YOUR ANSWER (in Korean):
"""

# --- HTTP 함수 라우터 (변경 없음) ---
@functions_framework.http
def dam_orchestrator_with_search(request):
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json'}
    if request.method == 'OPTIONS': return ('', 204, headers)
    try:
        request_json = request.get_json(silent=True)
        action = request_json.get('action')
        if action == 'upload': return handle_upload(request_json, headers)
        elif action == 'search': return handle_search(request_json, headers)
        elif action == 'find_similar_images': return handle_find_similar(request_json, headers)
        elif action == 'rag_chat': return handle_rag_chat(request_json, headers)
        else: return ('{"error": "Invalid action specified."}', 400, headers)
    except Exception as e:
        print(f"--- [FATAL ERROR] An exception occurred: {e} ---")
        traceback.print_exc()
        return (json.dumps({"error": f"An unexpected error occurred: {str(e)}"}), 500, headers)

# --- 핸들러 함수들 (모든 버그 수정 적용) ---
def handle_upload(data, headers):
    image_bytes = base64.b64decode(data['image_data'].split(",")[1])
    embeddings = embedding_model.get_embeddings(image=Image(image_bytes=image_bytes))
    image_embedding_vector = embeddings.image_embedding

    if vs_index_endpoint:
        try:
            similar_results = vs_index_endpoint.find_neighbors(deployed_index_id=DEPLOYED_INDEX_ID, queries=[image_embedding_vector], num_neighbors=1)
            if similar_results and similar_results[0] and similar_results[0][0].distance > 0.95:
                return ('{"error": "매우 유사한 자산이 이미 존재합니다. (유사도: ' + str(round(similar_results[0][0].distance * 100)) + '%)", "is_duplicate": true}', 409, headers)
        except Exception as e: print(f"중복 검사를 건너뜁니다: {e}")
    
    asset_id, vector_id = str(uuid.uuid4()), f"vec_{uuid.uuid4()}"
    image_path = f"gs://{BUCKET_NAME}/images/{asset_id}.png"
    storage_client.bucket(BUCKET_NAME).blob(f"images/{asset_id}.png").upload_from_string(image_bytes, content_type='image/png')
    
    response = generative_model.generate_content([Part.from_data(data=image_bytes, mime_type='image/png'), enhanced_prompt])
    metadata = json.loads(response.text.strip().replace('```json', '').replace('```', ''))
    row_to_insert = { "asset_id": asset_id, "vector_id": vector_id, "product_type": metadata.get("product_type"), "color": metadata.get("color"), "image_path": image_path, "created_at": datetime.now(timezone.utc).isoformat(), "concepts": json.dumps(metadata.get("concepts", [])), "alt_text": metadata.get("alt_text"), "marketing_copy": metadata.get("marketing_copy"), "veo_prompt": metadata.get("veo_prompt") }
    
    if vs_index:
        # [버그 수정] 공식 문서에 명시된, 정확한 주소의 'IndexDatapoint'를 사용합니다.
        datapoint = [IndexDatapoint(datapoint_id=vector_id, feature_vector=image_embedding_vector)]
        vs_index.upsert_datapoints(datapoints=datapoint)
        
    errors = bigquery_client.insert_rows_json(f"{PROJECT_ID}.{BIGQUERY_DATASET}.{BIGQUERY_TABLE}", [row_to_insert])
    if errors: raise Exception(f"BigQuery Insert Error: {errors}")
    return (json.dumps({"message": "자산이 성공적으로 분석 및 저장되었습니다!", "asset_id": asset_id}), 200, headers)

def handle_find_similar(data, headers):
    if not vs_index_endpoint: return ('{"error": "Vector Search가 설정되지 않았습니다."}', 500, headers)
    image_bytes = base64.b64decode(data['image_data'].split(",")[1])
    embeddings = embedding_model.get_embeddings(image=Image(image_bytes=image_bytes))
    image_embedding_vector = embeddings.image_embedding
    similar_results = vs_index_endpoint.find_neighbors(deployed_index_id=DEPLOYED_INDEX_ID, queries=[image_embedding_vector], num_neighbors=5)
    if not similar_results or not similar_results[0]: return (json.dumps([]), 200, headers)
    neighbor_ids = [f"'{neighbor.id}'" for neighbor in similar_results[0]]
    query = f"SELECT * FROM `{PROJECT_ID}.{BIGQUERY_DATASET}.{BIGQUERY_TABLE}` WHERE vector_id IN ({','.join(neighbor_ids)})"
    results = [dict(row) for row in bigquery_client.query(query)]
    for r in results:
        if isinstance(r.get('created_at'), datetime): r['created_at'] = r['created_at'].isoformat()
        if isinstance(r.get('concepts'), str): r['concepts'] = json.loads(r.get('concepts', '[]'))
    return (json.dumps(results), 200, headers)

# 나머지 함수들은 변경 없음
def handle_rag_chat(data, headers):
    question = data.get('question', '').strip()
    if not question: return ('{"error": "Question is required."}', 400, headers)
    query = f"SELECT product_type, color, concepts, marketing_copy, alt_text FROM `{PROJECT_ID}.{BIGQUERY_DATASET}.{BIGQUERY_TABLE}` ORDER BY created_at DESC LIMIT 50"
    context_data = [dict(row) for row in bigquery_client.query(query)]
    final_prompt = rag_prompt_template.format(question=question, context=json.dumps(context_data, ensure_ascii=False))
    response = generative_model.generate_content(final_prompt)
    return (json.dumps({"answer": response.text}), 200, headers)
def handle_search(data, headers):
    query_text = data.get('text_query', '').strip()
    if not query_text: return ('{"error": "Search keyword is required."}', 400, headers)
    keywords = [f"%{k.lower()}%" for k in query_text.split()]
    sql_query = f"SELECT * FROM `{PROJECT_ID}.{BIGQUERY_DATASET}.{BIGQUERY_TABLE}` WHERE " + " AND ".join([f"(LOWER(product_type) LIKE ? OR LOWER(color) LIKE ? OR LOWER(alt_text) LIKE ? OR LOWER(marketing_copy) LIKE ? OR EXISTS(SELECT 1 FROM UNNEST(JSON_EXTRACT_STRING_ARRAY(concepts)) AS concept WHERE LOWER(concept) LIKE ?))" for _ in keywords]) + " ORDER BY created_at DESC LIMIT 20"
    params = []
    for k in keywords: params.extend([k, k, k, k, k])
    job_config = bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter(None, "STRING", p) for p in params])
    results = [dict(row) for row in bigquery_client.query(sql_query, job_config=job_config)]
    for r in results:
        if isinstance(r.get('created_at'), datetime): r['created_at'] = r['created_at'].isoformat()
        if isinstance(r.get('concepts'), str): r['concepts'] = json.loads(r.get('concepts', '[]'))
    return (json.dumps(results), 200, headers)
