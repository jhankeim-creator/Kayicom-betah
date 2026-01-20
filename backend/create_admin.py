"""
Script to create admin user after deployment
Run this once after deploying to initialize admin account
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=False)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME', 'kayicom')

if not mongo_url:
    print("❌ Error: MONGO_URL environment variable not set")
    print("Please set MONGO_URL environment variable")
    exit(1)

try:
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
except Exception as e:
    print(f"❌ Error connecting to MongoDB: {e}")
    exit(1)

async def create_admin():
    """Create admin user if it doesn't exist, or update existing admin email"""
    try:
        new_email = "Info.kayicom.com@gmx.fr"
        default_password = "admin123"
        
        # Check if admin with new email already exists
        existing_new = await db.users.find_one({"email": new_email})
        
        if existing_new:
            print("✅ Admin user already exists with the correct email!")
            print(f"📧 Email: {existing_new.get('email')}")
            print(f"👤 Role: {existing_new.get('role')}")
            return
        
        # Check if there's an existing admin user with different email
        existing_admin = await db.users.find_one({"role": "admin"})
        
        if existing_admin:
            # Update existing admin email to new email
            old_email = existing_admin.get('email')
            await db.users.update_one(
                {"role": "admin"},
                {"$set": {"email": new_email}}
            )
            print("✅ Admin email updated successfully!")
            print(f"📧 Old Email: {old_email}")
            print(f"📧 New Email: {new_email}")
            print(f"🔑 Password: (unchanged - using existing password)")
            return
        
        # Create new admin user if none exists
        hashed_password = pwd_context.hash(default_password)
        
        admin_user = {
            "id": "admin-001",
            "email": new_email,
            "full_name": "Admin User",
            "password": hashed_password,
            "role": "admin",
            "referral_code": "ADMIN001",
            "referral_balance": 0.0,
            "wallet_balance": 0.0,
            "credits_balance": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.users.insert_one(admin_user)
        print("✅ Admin user created successfully!")
        print(f"📧 Email: {new_email}")
        print(f"🔑 Password: {default_password}")
        print("⚠️  IMPORTANT: Change password after first login!")
        
    except Exception as e:
        print(f"❌ Error creating/updating admin user: {e}")
        raise
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(create_admin())

