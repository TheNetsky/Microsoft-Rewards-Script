# Proxy Configuration

Proxy support enables the Microsoft Rewards script to route traffic through proxy servers for enhanced privacy, geographic flexibility, and network management.

## What Are Proxies?

Proxies act as intermediaries between your script and Microsoft's servers, providing:

- **IP Address Masking**: Hide your real IP address
- **Geographic Flexibility**: Appear to browse from different locations  
- **Rate Limiting**: Distribute requests across multiple IPs
- **Network Control**: Route traffic through specific servers
- **Privacy Enhancement**: Add layer of anonymity

## Configuration

Add to your `src/config.json`:

```json
{
  "browser": {
    "proxy": {
      "enabled": false,
      "server": "proxy.example.com:8080",
      "username": "",
      "password": "",
      "bypass": []
    }
  }
}
```

## Options

| Setting | Description | Example |
|---------|-------------|---------|
| `enabled` | Enable proxy usage | `true` |
| `server` | Proxy server address and port | `"proxy.example.com:8080"` |
| `username` | Proxy authentication username | `"proxyuser"` |
| `password` | Proxy authentication password | `"proxypass123"` |
| `bypass` | Domains to bypass proxy | `["localhost", "*.internal.com"]` |

## Proxy Types Supported

### HTTP Proxies
**Most common type for web traffic**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "http://proxy.example.com:8080",
      "username": "user",
      "password": "pass"
    }
  }
}
```

### HTTPS Proxies
**Encrypted proxy connections**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "https://secure-proxy.example.com:8080",
      "username": "user",
      "password": "pass"
    }
  }
}
```

### SOCKS Proxies
**Support for SOCKS4 and SOCKS5**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "socks5://socks-proxy.example.com:1080",
      "username": "user",
      "password": "pass"
    }
  }
}
```

## Common Proxy Providers

### Residential Proxies
**High-quality IPs from real devices**

**Popular Providers:**
- **Bright Data** (formerly Luminati)
- **Smartproxy**
- **Oxylabs**
- **ProxyMesh**

**Configuration Example:**
```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "rotating-residential.brightdata.com:22225",
      "username": "customer-username-session-random",
      "password": "your-password"
    }
  }
}
```

### Datacenter Proxies
**Fast and affordable server-based IPs**

**Popular Providers:**
- **SquidProxies**
- **MyPrivateProxy**
- **ProxyRack**
- **Storm Proxies**

**Configuration Example:**
```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "datacenter.squidproxies.com:8080",
      "username": "username",
      "password": "password"
    }
  }
}
```

### Free Proxies
**⚠️ Not recommended for production use**

**Risks:**
- Unreliable connections
- Potential security issues
- Often blocked by services
- Poor performance

## Authentication Methods

### Username/Password
**Most common authentication method**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "username": "your-username",
      "password": "your-password"
    }
  }
}
```

### IP Whitelisting
**Authentication by IP address**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "username": "",
      "password": ""
    }
  }
}
```

**Setup:**
1. Contact proxy provider
2. Provide your server's IP address
3. Configure whitelist in provider dashboard
4. Remove username/password from config

### Session-Based Authentication
**Rotating sessions with identifiers**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "session-proxy.example.com:8080",
      "username": "customer-session-sticky123",
      "password": "your-password"
    }
  }
}
```

## Bypass Configuration

### Local Development
**Bypass proxy for local services**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "bypass": [
        "localhost",
        "127.0.0.1",
        "*.local",
        "*.internal"
      ]
    }
  }
}
```

### Specific Domains
**Route certain domains directly**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "bypass": [
        "*.microsoft.com",
        "login.live.com",
        "account.microsoft.com"
      ]
    }
  }
}
```

### Pattern Matching
**Advanced bypass patterns**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "bypass": [
        "*.intranet.*",
        "192.168.*.*",
        "10.*.*.*",
        "<local>"
      ]
    }
  }
}
```

## Advanced Configurations

### Rotating Proxies
**Use different proxies for different accounts**

**Per-Account Configuration:**
```json
{
  "accounts": [
    {
      "email": "user1@example.com",
      "password": "password1",
      "proxy": {
        "enabled": true,
        "server": "proxy1.example.com:8080"
      }
    },
    {
      "email": "user2@example.com", 
      "password": "password2",
      "proxy": {
        "enabled": true,
        "server": "proxy2.example.com:8080"
      }
    }
  ]
}
```

### Failover Configuration
**Multiple proxy servers for redundancy**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "servers": [
        "primary-proxy.example.com:8080",
        "backup-proxy.example.com:8080",
        "emergency-proxy.example.com:8080"
      ],
      "username": "user",
      "password": "pass"
    }
  }
}
```

### Geographic Routing
**Location-specific proxy selection**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "regions": {
        "us": "us-proxy.example.com:8080",
        "eu": "eu-proxy.example.com:8080", 
        "asia": "asia-proxy.example.com:8080"
      },
      "defaultRegion": "us"
    }
  }
}
```

## Performance Optimization

### Connection Pooling
**Reuse proxy connections for efficiency**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "connectionPooling": true,
      "maxConnections": 10
    }
  }
}
```

### Timeout Configuration
**Adjust timeouts for proxy connections**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "timeouts": {
        "connect": 30000,
        "request": 60000,
        "idle": 120000
      }
    }
  }
}
```

### Compression
**Enable compression for bandwidth efficiency**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "compression": true,
      "gzip": true
    }
  }
}
```

## Security Considerations

### HTTPS Verification
**Verify SSL certificates through proxy**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "verifySSL": true,
      "rejectUnauthorized": true
    }
  }
}
```

### Credential Protection
**Secure proxy authentication**

**Environment Variables:**
```bash
# Set in environment
PROXY_USERNAME=your-username
PROXY_PASSWORD=your-password
```

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "username": "${PROXY_USERNAME}",
      "password": "${PROXY_PASSWORD}"
    }
  }
}
```

### Connection Encryption
**Encrypt traffic to proxy server**

```json
{
  "browser": {
    "proxy": {
      "enabled": true,
      "server": "https://encrypted-proxy.example.com:8080",
      "tls": {
        "enabled": true,
        "version": "TLSv1.3"
      }
    }
  }
}
```

## Troubleshooting

### Common Issues

**Connection Failed:**
```
[ERROR] Proxy connection failed: ECONNREFUSED
```
**Solutions:**
- Verify proxy server address and port
- Check proxy server is running
- Confirm firewall allows connections
- Test with different proxy server

**Authentication Failed:**
```
[ERROR] Proxy authentication failed: 407 Proxy Authentication Required
```
**Solutions:**
- Verify username and password
- Check account is active with provider
- Confirm IP is whitelisted (if applicable)
- Try different authentication method

**Timeout Errors:**
```
[ERROR] Proxy timeout: Request timeout
```
**Solutions:**
- Increase timeout values
- Check proxy server performance
- Try different proxy server
- Reduce concurrent connections

**SSL/TLS Errors:**
```
[ERROR] Proxy SSL error: certificate verify failed
```
**Solutions:**
- Disable SSL verification (temporarily)
- Update SSL certificates
- Use HTTP instead of HTTPS proxy
- Contact proxy provider

### Testing Proxy Configuration

**Basic Connectivity Test:**
```bash
# Test proxy connection
curl --proxy proxy.example.com:8080 http://httpbin.org/ip
```

**Authentication Test:**
```bash
# Test with authentication
curl --proxy user:pass@proxy.example.com:8080 http://httpbin.org/ip
```

**Script Debug Mode:**
```bash
# Enable proxy debugging
DEBUG_PROXY=1 npm start
```

### Monitoring Tools

**Check IP Address:**
```bash
# Verify proxy is working
curl --proxy proxy.example.com:8080 http://httpbin.org/ip
```

**Test Geolocation:**
```bash
# Check apparent location
curl --proxy proxy.example.com:8080 http://ipinfo.io/json
```

**Performance Testing:**
```bash
# Measure proxy latency
time curl --proxy proxy.example.com:8080 http://httpbin.org/delay/1
```

## Best Practices

### Proxy Selection
- **Residential > Datacenter** for avoiding detection
- **Paid > Free** for reliability and security
- **Multiple providers** for redundancy
- **Geographic diversity** for flexibility

### Configuration Management
- Store credentials securely (environment variables)
- Test proxy configuration before deployment
- Monitor proxy performance and availability
- Have backup proxy configurations ready

### Performance Optimization
- Use connection pooling when possible
- Set appropriate timeout values
- Monitor bandwidth usage
- Implement retry logic for failures

### Security Guidelines
- Use HTTPS proxies when possible
- Verify SSL certificates
- Rotate proxy credentials regularly
- Monitor for unauthorized access

## Integration Examples

### Docker Deployment
**Environment-based proxy configuration**

```dockerfile
# Dockerfile
ENV PROXY_ENABLED=true
ENV PROXY_SERVER=proxy.example.com:8080
ENV PROXY_USERNAME=user
ENV PROXY_PASSWORD=pass
```

### Kubernetes ConfigMap
**Centralized proxy configuration**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rewards-proxy-config
data:
  proxy.json: |
    {
      "enabled": true,
      "server": "proxy.example.com:8080",
      "username": "user",
      "password": "pass"
    }
```

### Multiple Environment Setup
**Different proxies per environment**

```json
{
  "development": {
    "proxy": {
      "enabled": false
    }
  },
  "staging": {
    "proxy": {
      "enabled": true,
      "server": "staging-proxy.example.com:8080"
    }
  },
  "production": {
    "proxy": {
      "enabled": true,
      "server": "prod-proxy.example.com:8080"
    }
  }
}
```

## Legal and Compliance

### Terms of Service
- Review Microsoft's Terms of Service
- Understand proxy provider's acceptable use policy
- Ensure compliance with local regulations
- Consider geographic restrictions

### Data Privacy
- Understand what data flows through proxy
- Consider proxy provider's data retention policies
- Implement additional encryption if needed
- Review proxy logs and monitoring

### Rate Limiting
- Respect Microsoft's rate limits
- Implement proper delays between requests
- Monitor for IP blocking or throttling
- Use proxy rotation to distribute load

## Performance Monitoring

### Key Metrics
- **Connection Success Rate**: % of successful proxy connections
- **Response Time**: Average request latency through proxy
- **Bandwidth Usage**: Data transferred through proxy
- **Error Rate**: % of failed requests via proxy

### Monitoring Tools
```bash
# Simple proxy health check
#!/bin/bash
PROXY="proxy.example.com:8080"
curl --proxy $PROXY --connect-timeout 10 http://httpbin.org/status/200
echo "Proxy health: $?"
```

### Performance Tuning
- Monitor concurrent connection limits
- Adjust timeout values based on proxy performance
- Implement connection reuse where possible
- Use compression to reduce bandwidth usage