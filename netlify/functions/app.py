import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app import app

def handler(event, context):
    """Netlify serverless function handler"""
    return {
        "statusCode": 200,
        "body": "Flask app running"
    }
