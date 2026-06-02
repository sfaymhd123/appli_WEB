import requests

base_url = "http://localhost:8080/fhir"

def delete_all(resource_type):
    print(f"Deleting all {resource_type}...")
    while True:
        resp = requests.get(f"{base_url}/{resource_type}?_summary=count")
        total = resp.json().get("total", 0)
        if total == 0:
            break
        
        # Fetch IDs to delete (HAPI doesn't support bulk delete without specialized plugins)
        search_resp = requests.get(f"{base_url}/{resource_type}?_count=100")
        entries = search_resp.json().get("entry", [])
        if not entries:
            break
            
        bundle = {
            "resourceType": "Bundle",
            "type": "batch",
            "entry": [
                {"request": {"method": "DELETE", "url": f"{resource_type}/{e['resource']['id']}"}}
                for e in entries
            ]
        }
        requests.post(base_url, json=bundle)
        print(f"  Deleted {len(entries)} resources. Remaining: {total - len(entries)}")

# Clear problematic resources
delete_all("DetectedIssue")
delete_all("Encounter")
delete_all("Task")
delete_all("CarePlan")
delete_all("Patient") # Clear patients too just in case of ID drift
