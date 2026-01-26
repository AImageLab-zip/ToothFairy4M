# Testing Patterns

**Analysis Date:** 2026-01-26

## Test Framework

**Runner:**
- Test framework: Manual/Integration tests primarily (no pytest, unittest discovery configured)
- Tests located in: `/home/llumetti/ToothFairy4M-dev/test/` and root test script

**Assertion Library:**
- Manual assertions (status code checks): `if response.status_code == expected_status`
- Request library used for HTTP testing: `import requests`

**Run Commands:**
```bash
python test/run_test.py              # Run upload test with interactive prompts
python test_external_api.py          # Run external API endpoint tests
python manage.py runserver           # Start development server for testing
```

## Test File Organization

**Location:**
- Integration tests in `/test/` directory at project root
- Test infrastructure separate from application code (not co-located)
- Multiple test files for different features: `test_upload.py`, `test_external_api.py`

**Naming:**
- `test_*.py` convention: `test_upload.py`, `test_external_api.py`
- Main runner: `run_test.py`
- Configuration: `test/config.py`

**Structure:**
```
test/
├── config.py           # Configuration for test environment
├── run_test.py         # Main test runner with prompts
├── test_upload.py      # Patient upload functionality tests
├── README.md           # Test documentation
test_external_api.py    # Root-level API tests
```

## Test Structure

**Suite Organization:**

From `test_external_api.py`:
```python
def test_endpoint(url, method="GET", data=None, expected_status=200):
    """Test an API endpoint"""
    full_url = urljoin(BASE_URL, url)
    print(f"\n🧪 Testing {method} {url}")

    try:
        if method == "GET":
            response = requests.get(full_url)
        elif method == "POST":
            response = requests.post(full_url, json=data, headers={"Content-Type": "application/json"})

        print(f"   Status: {response.status_code}")

        if response.status_code == expected_status:
            print("   ✅ Status code matches expected")
        else:
            print(f"   ❌ Expected {expected_status}, got {response.status_code}")

        # Try to parse JSON response
        try:
            json_response = response.json()
            print(f"   Response type: {type(json_response)}")

            if isinstance(json_response, dict):
                print(f"   Success: {json_response.get('success', 'N/A')}")
                if 'error' in json_response:
                    print(f"   Error: {json_response['error']}")
```

**Patterns:**
- Request-response testing: Issue HTTP request, check status code
- JSON response validation: Parse response and check for `success` and `error` fields
- Error state testing: Expect specific status codes (401, 403, 404, 400)
- Function-based test structure with helper functions
- Main runner function orchestrating test execution

## Mocking

**Framework:**
- No dedicated mocking library found (no unittest.mock detected in imports)
- Real external API calls used in tests

**Patterns:**
- Tests use real HTTP requests: `requests.get()`, `requests.post()`
- Session management for login state: `session = requests.Session()`
- CSRF token extraction: `csrf_match = re.search(r'name="csrfmiddlewaretoken"...', response.text)`
- Configuration-based test data: Tests use configurable URLs, credentials, and file paths

**What to Mock:**
- External file operations (if adding unit tests)
- Third-party API calls (if needed for isolated testing)
- Database operations (for unit test isolation)

**What NOT to Mock:**
- Django ORM models (use test database)
- HTTP status codes (test real responses)
- File existence checks (currently tested as-is)

## Fixtures and Factories

**Test Data:**
```python
# From test_upload.py
FILES_CONFIG = {
    "upper_scan_raw": r"E:\...\upper.stl",
    "lower_scan_raw": r"E:\...\lower.stl",
    "cbct": r"E:\...\1.nii.gz",
    "teleradiography": r"C:\...\licensed-image.jpg",
    "panoramic": r"C:\...\licensed-image.jpg",
    "intraoral_photos": [r"C:\...\licensed-image.jpg"] * 5
}

UPLOAD_CONFIG = {
    "patient_name": "Multi Modal Patient Example",
    "folder_id": "1",
    "modalities": "ios,cbct,teleradiography,panoramic,intraoral"
}
```

**Location:**
- Fixtures in `test/config.py`: Configuration constants and file paths
- Test data hardcoded in test functions
- Configuration import pattern: `from config import BASE_URL, PROJECT_SLUG, USERNAME, PASSWORD`
- Fallback defaults when config not found

## Coverage

**Requirements:**
- No explicit coverage requirements detected
- No coverage configuration files found

**View Coverage:**
- No automated coverage reporting
- Manual integration tests for key endpoints:
  - `/accounts/login/` - Authentication
  - `/api/<project_slug>/upload/` - Patient upload
  - `/api/<project_slug>/patients/` - Patient list/bulk retrieval
  - `/api/<project_slug>/patients/<id>/files/` - Patient file retrieval
  - `/api/processing/health/` - Health check

## Test Types

**Integration Tests:**
- Scope: Full request-response cycle through Django application
- Approach: HTTP requests to running server with real database
- Examples: `test_upload.py` - Logs in, uploads patient with multiple modalities
- Server must be running: Tests against `http://localhost:8000` (configurable)

**API Tests:**
- Scope: Test external API endpoints with various input states
- Approach: Test valid and invalid requests, permission checking
- Examples from `test_external_api.py`:
  - Valid upload (expect authentication required): `POST /api/{slug}/upload/` → 401
  - Non-existent project: `GET /api/{slug}/patients/` → 404
  - Valid bulk request: `POST /api/{slug}/patients/` with `patient_ids: [...]`
  - Error cases: Too many IDs (>100), empty list, non-existent IDs

**End-to-End Tests:**
- Not explicitly documented in codebase
- Could be implemented using `test_upload.py` pattern with actual file uploads

## Common Patterns

**Async Testing:**
- Not applicable (Django views are synchronous)

**Error Testing:**
```python
# From test_external_api.py - Testing error cases
test_endpoint(f"/api/{PROJECT_SLUG}/upload/", method="POST", data={}, expected_status=401)
# Expect authentication error on protected endpoint

test_endpoint(f"/api/{PROJECT_SLUG}/patients/", method="POST",
              data={"patient_ids": []}, expected_status=400)
# Expect validation error on empty patient list

test_endpoint(f"/api/{PROJECT_SLUG}/patients/", method="POST",
              data={"patient_ids": large_list}, expected_status=400)
# Expect limit validation error (>100 patients)
```

**Status Code Validation:**
```python
def test_endpoint(url, method="GET", data=None, expected_status=200):
    # ...
    if response.status_code == expected_status:
        print("   ✅ Status code matches expected")
    else:
        print(f"   ❌ Expected {expected_status}, got {response.status_code}")

    return response.status_code == expected_status
```

**JSON Response Parsing:**
```python
try:
    json_response = response.json()

    if isinstance(json_response, dict):
        print(f"   Success: {json_response.get('success', 'N/A')}")
        if 'error' in json_response:
            print(f"   Error: {json_response['error']}")

        # Check for specific response fields
        if json_response.get('success'):
            if 'total_patients' in json_response:
                print(f"   Total patients: {json_response['total_patients']}")

except json.JSONDecodeError:
    print(f"   Response (first 200 chars): {response.text[:200]}")
```

## Test Execution Notes

**Interactive Testing:**
- `run_test.py` uses interactive prompts: `response = input("Do you want to proceed? (y/N): ")`
- Prints emoji-prefixed status messages: `✅`, `❌`, `⚠️`, `🦷`, `📋`, `🚀`
- Verbose output for debugging: Shows file sizes, folder information, upload results

**Configuration:**
- Tests default to `http://pdor.ing.unimore.it:8080` if no config file
- Can override with `test/config.py`:
  ```python
  BASE_URL = "http://localhost:8000"
  PROJECT_SLUG = "maxillo"
  USERNAME = "testuser"
  PASSWORD = "testpass"
  ```

**Prerequisites:**
1. Django server running on configured BASE_URL
2. Test user account with upload permissions
3. Test files available at configured paths
4. Project with slug matching PROJECT_SLUG

**Next Steps for Testing:**
- Create projects in Django admin
- Create test users with appropriate roles
- Prepare test data files
- Run `python test/run_test.py` or `python test_external_api.py`

---

*Testing analysis: 2026-01-26*
