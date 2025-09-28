# 🔐 Text2toss Security Setup Guide

## Environment Variables Setup

This application uses environment variables to securely store API keys and credentials. **Never commit .env files to Git!**

### Quick Setup

1. **Copy example files:**
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

2. **Configure backend/.env:**
   ```bash
   # Database Configuration
   MONGO_URL="mongodb://localhost:27017"
   DB_NAME="text2toss_db"
   
   # Twilio SMS (Required for SMS notifications)
   TWILIO_ACCOUNT_SID=your_account_sid_from_twilio_console
   TWILIO_AUTH_TOKEN=your_auth_token_from_twilio_console
   TWILIO_PHONE_NUMBER=+1234567890
   
   # Stripe Payment Processing (Required for payments)
   STRIPE_API_KEY=your_stripe_secret_key
   
   # Emergent LLM Integration (Required for AI quotes)
   EMERGENT_LLM_KEY=your_emergent_llm_key
   ```

3. **Configure frontend/.env:**
   ```bash
   # Backend API URL (Required)
   REACT_APP_BACKEND_URL=your_backend_url
   
   # Google Maps (Optional - for route optimization)
   REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_key
   ```

### Where to Find Credentials

- **Twilio**: https://console.twilio.com (Account SID, Auth Token, Phone Number)
- **Stripe**: https://dashboard.stripe.com/apikeys (Secret Key)
- **Google Maps**: https://console.cloud.google.com (Maps API Key)

### Security Notes

- ✅ .env files are ignored by Git
- ✅ Example files show the required format
- ❌ Never commit real API keys to version control
- ❌ Never share .env files publicly

### Admin Account

The admin system uses secure username/password authentication:
- **Default setup**: Run the initialization endpoint once
- **Login**: Use your configured username and password
- **Security**: Passwords are hashed with bcrypt

### Troubleshooting

If GitHub blocks your push due to secrets:
1. Check that .env files are in .gitignore
2. Remove any hardcoded keys from source files
3. Use environment variables instead of hardcoded values
4. Clear Git history if needed: `git filter-branch` or BFG Repo-Cleaner