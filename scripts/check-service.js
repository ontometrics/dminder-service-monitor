#!/usr/bin/env node

const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const { URL } = require('url');

async function checkService(serviceConfig) {
  const results = {
    id: serviceConfig.id,
    name: serviceConfig.name,
    url: serviceConfig.url,
    timestamp: new Date().toISOString(),
    checks: []
  };

  if (serviceConfig.enabled === false || serviceConfig.skip_reason) {
    results.skipped = true;
    results.skip_reason = serviceConfig.skip_reason || 'Disabled';
    return results;
  }

  try {
    const startTime = Date.now();
    const response = await makeRequest(serviceConfig.url, serviceConfig.headers);
    const responseTime = Date.now() - startTime;

    // Run all checks
    for (const check of serviceConfig.checks || []) {
      const checkResult = await runCheck(check, response, responseTime);
      results.checks.push(checkResult);
    }

    results.success = results.checks.every(c => c.passed);
    results.responseTime = responseTime;

  } catch (error) {
    results.success = false;
    results.error = error.message;
    results.checks.push({
      type: 'request',
      passed: false,
      error: error.message
    });
  }

  return results;
}

async function makeRequest(urlString, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const protocol = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': 'dminder-monitor/1.0',
        ...headers
      },
      timeout: 10000
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function runCheck(check, response, responseTime) {
  const result = {
    type: check.type,
    passed: false
  };

  try {
    switch (check.type) {
      case 'status':
        if (check.acceptable) {
          result.passed = check.acceptable.includes(response.statusCode);
          result.actual = response.statusCode;
          result.acceptable = check.acceptable;
        } else {
          result.passed = response.statusCode === check.expected;
          result.actual = response.statusCode;
          result.expected = check.expected;
        }
        break;

      case 'response_time':
        result.passed = responseTime <= check.max_ms;
        result.actual = responseTime;
        result.max = check.max_ms;
        break;

      case 'json_path':
        const json = JSON.parse(response.body);
        const value = getJsonPath(json, check.path);
        result.actual = value;
        
        if (check.expected !== undefined) {
          result.passed = value === check.expected;
          result.expected = check.expected;
        } else if (check.min !== undefined || check.max !== undefined) {
          result.passed = true;
          if (check.min !== undefined && value < check.min) result.passed = false;
          if (check.max !== undefined && value > check.max) result.passed = false;
          result.min = check.min;
          result.max = check.max;
        }
        break;

      case 'json_schema':
        // Simple schema validation (in production, use ajv)
        const jsonData = JSON.parse(response.body);
        result.passed = validateSimpleSchema(jsonData, check.schema);
        break;
    }
  } catch (error) {
    result.passed = false;
    result.error = error.message;
  }

  return result;
}

function getJsonPath(obj, path) {
  // Simple JSON path implementation (supports $.key and $.key[0])
  const parts = path.replace('$', '').split('.');
  let current = obj;
  
  for (const part of parts) {
    if (!part) continue;
    
    const arrayMatch = part.match(/(.+)\[(\d+)\]/);
    if (arrayMatch) {
      current = current[arrayMatch[1]][parseInt(arrayMatch[2])];
    } else {
      current = current[part];
    }
  }
  
  return current;
}

function validateSimpleSchema(data, schema) {
  // Very basic schema validation
  if (schema.type && typeof data !== schema.type) return false;
  
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!(key in data)) return false;
      if (propSchema.type && typeof data[key] !== propSchema.type) return false;
      if (propSchema.minimum && data[key] < propSchema.minimum) return false;
      if (propSchema.maximum && data[key] > propSchema.maximum) return false;
    }
  }
  
  return true;
}

async function main() {
  const configFile = process.argv[2];
  if (!configFile) {
    console.error('Usage: check-service.js <config-file>');
    process.exit(1);
  }

  const config = yaml.load(await fs.readFile(configFile, 'utf8'));
  const results = {
    name: config.name,
    timestamp: new Date().toISOString(),
    services: []
  };

  for (const service of config.services) {
    console.log(`Checking ${service.name}...`);
    const serviceResult = await checkService(service);
    results.services.push(serviceResult);
    
    if (!serviceResult.success && !serviceResult.skipped) {
      console.error(`  ❌ Failed: ${serviceResult.error || 'Check failed'}`);
    } else if (serviceResult.skipped) {
      console.log(`  ⏭️  Skipped: ${serviceResult.skip_reason}`);
    } else {
      console.log(`  ✅ Success (${serviceResult.responseTime}ms)`);
    }
  }

  // Save results
  await fs.writeFile('check-results.json', JSON.stringify(results, null, 2));

  // Exit with error if any service failed
  const hasFailures = results.services.some(s => !s.success && !s.skipped);
  process.exit(hasFailures ? 1 : 0);
}

main().catch(console.error);