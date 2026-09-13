import sys
import os
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app import app

# For Netlify serverless functions
def handler(event, context):
    return {
        "statusCode": 200,
        "body": "Laptop Recommender API"
    }

# For local/traditional WSGI
if __name__ == "__main__":
    app.run(debug=True)
