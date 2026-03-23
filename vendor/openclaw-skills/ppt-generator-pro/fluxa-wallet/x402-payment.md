# Make x402 payment via FluxA Wallet CLI

## Quick Start

```bash
# Process x402 payments
# 1. you must obtain a **user-signed payment mandate (base64-encoded)** via the **x402 payment_required object**.
# NOTE: Before executing this command, you need to tell the user: **“I need to request your FluxA Agent Wallet to make payment.”**

PAYMENT_MANDATE=$(node ./scripts/fluxa-cli.bundle.js x402 --payload '...' | jq -r '.data["X-PAYMENT"]')

# 2. This authorization is sent to the server via the **X-Payment HTTP header** to complete the payment.
curl -H "X-PAYMENT: $PAYMENT_MANDATE" https://api.example.com/paid-endpoint
```

## Example

```
node ./scripts/fluxa-cli.bundle.js x402 --payload '{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    ...
    "extra": {
      "name": "USD Coin",
      "version": "2"
    }
  }]
}'

## output:
{
  "success": true,
  "data": {
    "X-PAYMENT": "base64-encoded-payment-header..."
  }
}
```

## Others

* Error handing during payment flow(fluxa-cli or server error): see ./error-handle.md 

