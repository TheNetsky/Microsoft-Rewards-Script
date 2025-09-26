# 🌐 Proxy Configuration

<div align="center">

**🔒 Route traffic through proxy servers for privacy and flexibility**  
*Enhanced anonymity and geographic control*

</div>

---

## 🎯 What Are Proxies?

Proxies act as **intermediaries** between your script and Microsoft's servers, providing enhanced privacy, geographic flexibility, and network management capabilities.

### **Key Benefits**
- 🎭 **IP masking** — Hide your real IP address
- 🌍 **Geographic flexibility** — Appear to browse from different locations
- ⚡ **Rate limiting** — Distribute requests across multiple IPs
- 🔧 **Network control** — Route traffic through specific servers
- 🔒 **Privacy enhancement** — Add layer of anonymity

---

## ⚙️ Configuration

### **Basic Setup**
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

### **Configuration Options**

| Setting | Description | Example |
|---------|-------------|---------|
| `enabled` | Enable proxy usage | `true` |
| `server` | Proxy server address and port | `"proxy.example.com:8080"` |
| `username` | Proxy authentication username | `"proxyuser"` |
| `password` | Proxy authentication password | `"proxypass123"` |
| `bypass` | Domains to bypass proxy | `["localhost", "*.internal.com"]` |

---

## 🔌 Supported Proxy Types

### **HTTP Proxies**
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

### **HTTPS Proxies**
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

### **SOCKS Proxies**
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

---

## 🏢 Popular Proxy Providers

### **Residential Proxies (Recommended)**
**High-quality IPs from real devices**

#### **Top Providers**
- **Bright Data** (formerly Luminati) — Premium quality
- **Smartproxy** — User-friendly dashboard
- **Oxylabs** — Enterprise-grade
- **ProxyMesh** — Developer-focused

#### **Configuration Example**
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

### **Datacenter Proxies**
**Fast and affordable server-based IPs**

#### **Popular Providers**
- **SquidProxies** — Reliable performance
- **MyPrivateProxy** — Dedicated IPs
- **ProxyRack** — Budget-friendly
- **Storm Proxies** — Rotating options

#### **Configuration Example**
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

### **Free Proxies**
**⚠️ Not recommended for production use**

#### **Risks**
- ❌ Unreliable connections
- ❌ Potential security issues
- ❌ Often blocked by services
- ❌ Poor performance

---

## 🔐 Authentication Methods

### **Username/Password (Most Common)**
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

### **IP Whitelisting**
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

**Setup Steps:**
1. Contact proxy provider
2. Provide your server's IP address
3. Configure whitelist in provider dashboard
4. Remove credentials from config

### **Session-Based Authentication**
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

---

## 🚫 Bypass Configuration

### **Local Development**
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

### **Specific Domains**
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

### **Advanced Patterns**
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

---

## 🎛️ Advanced Configurations

### **Per-Account Proxies**
**Different proxies for different accounts**
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

### **Failover Configuration**
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

### **Geographic Routing**
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

---

## 🔒 Security & Environment Variables

### **Credential Protection**
**Secure proxy authentication**

**Environment Variables:**
```powershell
# Set in environment
$env:PROXY_USERNAME="your-username"
$env:PROXY_PASSWORD="your-password"
```

**Configuration:**
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

### **HTTPS Verification**
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

### **Connection Encryption**
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

---

## 🧪 Testing & Debugging

### **Manual Tests**
```bash
# Test proxy connection
curl --proxy proxy.example.com:8080 http://httpbin.org/ip

# Test with authentication
curl --proxy user:pass@proxy.example.com:8080 http://httpbin.org/ip

# Test geolocation
curl --proxy proxy.example.com:8080 http://ipinfo.io/json
```

### **Script Debug Mode**
```powershell
$env:DEBUG_PROXY=1; npm start
```

### **Health Check Script**
```bash
#!/bin/bash
PROXY="proxy.example.com:8080"
curl --proxy $PROXY --connect-timeout 10 http://httpbin.org/status/200
echo "Proxy health: $?"
```

---

## 🛠️ Troubleshooting

| Problem | Error | Solution |
|---------|-------|----------|
| **Connection Failed** | `ECONNREFUSED` | Verify server address/port; check firewall |
| **Auth Failed** | `407 Proxy Authentication Required` | Verify username/password; check IP whitelist |
| **Timeout** | `Request timeout` | Increase timeout values; try different server |
| **SSL Error** | `certificate verify failed` | Disable SSL verification; update certificates |

### **Common Error Messages**

#### **Connection Issues**
```
[ERROR] Proxy connection failed: ECONNREFUSED
```
**Solutions:**
- ✅ Verify proxy server address and port
- ✅ Check proxy server is running
- ✅ Confirm firewall allows connections
- ✅ Test with different proxy server

#### **Authentication Issues**
```
[ERROR] Proxy authentication failed: 407 Proxy Authentication Required
```
**Solutions:**
- ✅ Verify username and password
- ✅ Check account is active with provider
- ✅ Confirm IP is whitelisted (if applicable)
- ✅ Try different authentication method

#### **Performance Issues**
```
[ERROR] Proxy timeout: Request timeout
```
**Solutions:**
- ✅ Increase timeout values
- ✅ Check proxy server performance
- ✅ Try different proxy server
- ✅ Reduce concurrent connections

---

## ⚡ Performance Optimization

### **Connection Settings**
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
      },
      "connectionPooling": true,
      "maxConnections": 10
    }
  }
}
```

### **Compression Settings**
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

### **Monitoring Metrics**
- **Connection Success Rate** — % of successful proxy connections
- **Response Time** — Average request latency through proxy
- **Bandwidth Usage** — Data transferred through proxy
- **Error Rate** — % of failed requests via proxy

---

## 🐳 Container Integration

### **Docker Environment**
```dockerfile
# Dockerfile
ENV PROXY_ENABLED=true
ENV PROXY_SERVER=proxy.example.com:8080
ENV PROXY_USERNAME=user
ENV PROXY_PASSWORD=pass
```

### **Kubernetes ConfigMap**
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

### **Environment-Specific**
```json
{
  "development": {
    "proxy": { "enabled": false }
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

---

## 📊 Best Practices

### **Proxy Selection**
- 🏆 **Residential > Datacenter** — Better for avoiding detection
- 💰 **Paid > Free** — Reliability and security
- 🔄 **Multiple providers** — Redundancy and failover
- 🌍 **Geographic diversity** — Flexibility and compliance

### **Configuration Management**
- 🔑 **Environment variables** — Secure credential storage
- 🧪 **Test before deploy** — Verify configuration works
- 📊 **Monitor performance** — Track availability and speed
- 🔄 **Backup configs** — Ready failover options

### **Security Guidelines**
- 🔒 **HTTPS proxies** — Encrypted connections when possible
- 🛡️ **SSL verification** — Verify certificates
- 🔄 **Rotate credentials** — Regular password updates
- 👁️ **Monitor access** — Watch for unauthorized usage

---

## ⚖️ Legal & Compliance

### **Terms of Service**
- 📋 Review Microsoft's Terms of Service
- 📄 Understand proxy provider's acceptable use policy
- 🌍 Ensure compliance with local regulations
- 🗺️ Consider geographic restrictions

### **Data Privacy**
- 🔍 Understand data flow through proxy
- 📝 Review proxy provider's data retention policies
- 🔐 Implement additional encryption if needed
- 📊 Monitor proxy logs and access

### **Rate Limiting**
- ⏱️ Respect Microsoft's rate limits
- ⏸️ Implement proper delays between requests
- 🚦 Monitor for IP blocking or throttling
- 🔄 Use proxy rotation to distribute load

---

## 🔗 Related Guides

- **[Getting Started](./getting-started.md)** — Initial setup and configuration
- **[Security](./security.md)** — Privacy and data protection
- **[Docker](./docker.md)** — Container deployment with proxies
- **[Humanization](./humanization.md)** — Natural behavior patterns