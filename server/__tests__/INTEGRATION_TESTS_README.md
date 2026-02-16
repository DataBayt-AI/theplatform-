# Running HuggingFace Integration Tests

## Overview

Integration tests make **real API calls** to HuggingFace's datasets server to validate behavior with actual large datasets. These tests are separate from unit tests and are optional.

## Quick Start

### Run Integration Tests

```bash
# Set environment variable to enable integration tests
$env:RUN_INTEGRATION_TESTS="true"

# Run all integration tests
npm test -- server/__tests__/huggingface.integration.test.js

# Or run specific test suite
npm test -- server/__tests__/huggingface.integration.test.js -t "Small Dataset"
```

### Skip Integration Tests (Default)

```bash
# Integration tests are skipped by default
npm test

# Explicitly skip
$env:RUN_INTEGRATION_TESTS="false"
npm test
```

## Test Datasets

The integration tests use three publicly available datasets from HuggingFace:

| Dataset | Rows | Description | Use Case |
|---------|------|-------------|----------|
| `SetFit/emotion` | ~2,000 | Small emotion classification | Quick validation |
| `ag_news` | ~30,000 | AG News articles | Medium-scale testing |
| `imdb` | ~50,000 | Movie reviews | Large-scale testing |

## What is Tested

### ✅ Data Fetching
- Fetching dataset splits
- Retrieving rows with pagination
- Handling maxRows parameter
- Large offset handling (offset 10,000+)

### ✅ Data Integrity
- Row normalization with real data structures
- Column extraction from heterogeneous data
- Data consistency across chunks

### ✅ Error Handling
- Invalid dataset names
- Malformed config/split combinations
- Network error resilience

### ✅ Performance
- 1,000 rows fetched in < 30 seconds
- 500 rows (5 chunks) in < 15 seconds
- Throughput measurement (rows/second)

## Test Structure

```
server/__tests__/huggingface.integration.test.js
├── Small Dataset (~2k rows)
│   ├── Fetch splits
│   ├── Fetch first 100 rows
│   └── Test maxRows limiting
├── Medium Dataset (~30k rows)
│   ├── Validate dataset size
│   └── Fetch multiple chunks efficiently
├── Large Dataset (~50k rows)
│   ├── Validate availability
│   └── Handle large offsets
├── Data Integrity
│   └── Normalize real data structures
├── Error Handling
│   ├── Invalid dataset names
│   └── Malformed config/split
└── Performance
    └── Fetch 1000 rows benchmark
```

## Example Output

```
🌐 Running integration tests with real HuggingFace API...

✅ SetFit/emotion: Found 3 splits
✅ SetFit/emotion: Fetched 100 rows
   First row keys: text, label
✅ SetFit/emotion: Correctly limited to 50 rows (max: 50)

✅ ag_news: Dataset has 30,000 rows
✅ ag_news: Fetched 500 rows in 8,234ms

✅ imdb: Dataset has 50,000 total rows
✅ imdb: Successfully fetched rows from offset 10000

✅ Normalization: 50 rows → columns: text, label
✅ Correctly handled invalid dataset (status: 404)
✅ Performance: 1000 rows in 12,456ms (~80 rows/sec)

Test Files  1 passed (1)
     Tests  15 passed (15)
  Duration  45.3s
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on:
  workflow_dispatch:  # Manual trigger only
  schedule:
    - cron: '0 2 * * 0'  # Weekly on Sundays at 2 AM

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - name: Run Integration Tests
        env:
          RUN_INTEGRATION_TESTS: 'true'
        run: npm test -- server/__tests__/huggingface.integration.test.js
```

## Troubleshooting

### Tests are skipped

**Problem:** Tests show as "skipped" even with environment variable set.

**Solution:**
```bash
# Windows PowerShell
$env:RUN_INTEGRATION_TESTS="true"
npm test -- server/__tests__/huggingface.integration.test.js

# Windows CMD
set RUN_INTEGRATION_TESTS=true
npm test -- server/__tests__/huggingface.integration.test.js

# Linux/Mac
RUN_INTEGRATION_TESTS=true npm test server/__tests__/huggingface.integration.test.js
```

### Timeout errors

**Problem:** Tests fail with timeout errors.

**Solution:**
- Check internet connection
- HuggingFace API may be experiencing issues
- Increase timeout:
  ```javascript
  it('test name', async () => {
    // ...
  }, 60000); // 60 second timeout
  ```

### Dataset not available

**Problem:** Specific dataset returns 404.

**Solution:**
- Dataset may have been removed or renamed
- Update `TEST_DATASETS` in the test file with alternative datasets
- Check [huggingface.co/datasets](https://huggingface.co/datasets) for alternatives

## Performance Expectations

Based on typical network conditions:

| Operation | Expected Time | Notes |
|-----------|---------------|-------|
| Fetch splits | < 2 seconds | Single API call |
| Fetch 100 rows | < 5 seconds | Single chunk |
| Fetch 1,000 rows | < 30 seconds | 10 chunks, sequential |
| Full test suite | < 60 seconds | All integration tests |

## Notes

- **Network Required:** These tests require internet access
- **Rate Limiting:** HuggingFace may rate-limit requests; tests include delays
- **Dataset Availability:** Public datasets may change; tests handle gracefully
- **Test Duration:** Integration tests take longer than unit tests (~45-60 seconds)

## Adding New Datasets

To test with additional datasets:

1. Find a dataset on [huggingface.co/datasets](https://huggingface.co/datasets)
2. Add to `TEST_DATASETS` object in test file:
   ```javascript
   custom: {
     name: 'username/dataset-name',
     description: 'Description of dataset',
     expectedRows: 10000,
     expectedColumns: ['column1', 'column2']
   }
   ```
3. Create test cases as needed

## Related Documentation

- [Unit Tests README](../README.md#testing)
- [Performance Tests](./huggingface-performance.test.js)
- [HuggingFace Datasets API](https://huggingface.co/docs/datasets-server)
