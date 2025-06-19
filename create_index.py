from google.cloud import aiplatform
import time

PROJECT_ID = "duleetest"
REGION = "us-central1"
BUCKET_URI = "gs://hsad-final-assets-v2/vector_index_data"
INDEX_DISPLAY_NAME = "hsad-final-index-v3"
ENDPOINT_DISPLAY_NAME = "hsad-final-endpoint-v3"
DEPLOYED_INDEX_ID = "hsad_final_deployed_v3"

aiplatform.init(project=PROJECT_ID, location=REGION)

print(f"Creating Tree AH index with streaming support...")
my_index = aiplatform.MatchingEngineIndex.create_tree_ah_index(
    display_name=INDEX_DISPLAY_NAME,
    contents_delta_uri=BUCKET_URI,
    dimensions=1408,
    approximate_neighbors_count=15,
    distance_measure_type="DOT_PRODUCT_DISTANCE",
    leaf_node_embedding_count=500,
    leaf_nodes_to_search_percent=7,
    index_update_method="STREAM_UPDATE"
)
print(f"Index created successfully. Resource name: {my_index.resource_name}")

print(f"Creating Index Endpoint...")
# --- 최종 오류 수정: public_endpoint_enabled=True 추가 ---
my_endpoint = aiplatform.MatchingEngineIndexEndpoint.create(
    display_name=ENDPOINT_DISPLAY_NAME,
    project=PROJECT_ID,
    location=REGION,
    public_endpoint_enabled=True
)
# --------------------------------------------------------
print(f"Endpoint created successfully. Resource name: {my_endpoint.resource_name}")

print("Waiting for 30 seconds before deploying index...")
time.sleep(30)

print(f"Deploying index to endpoint... (This will take 30-60 minutes)")
my_endpoint.deploy_index(
    index=my_index,
    deployed_index_id=DEPLOYED_INDEX_ID
)
print("Deployment command submitted successfully. Please monitor the operation in the Google Cloud Console.")
