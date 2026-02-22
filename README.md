# Hackalytics_Repo



startup:
FE:                                          
source ~/.nvm/nvm.sh && nvm use 20                                                                       npm run dev
BE:                                                    
source venv/bin/activate
python main.py



Setup for Databricks SDK:

In your `Backend/.env` file, add the following lines:

```env
DATABRICKS_CLIENT_ID=<client_id>
DATABRICKS_CLIENT_SECRET=<client_secret>
MODEL_EXECUTION_MODE=remote
```