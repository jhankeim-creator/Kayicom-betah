import aiohttp
import os
from typing import Dict, Optional

PLISIO_API_URL = "https://plisio.net/api/v1"

class PlisioHelper:
    def __init__(self, api_key: str):
        self.api_key = api_key
    
    async def create_invoice(self, 
                            amount: float,
                            currency: str = "USDT",
                            order_name: str = "Crypto Purchase",
                            order_number: str = None,
                            callback_url: str = None,
                            email: str = None,
                            source_currency: str = "USD",
                            source_amount: Optional[float] = None,
                            success_url: Optional[str] = None,
                            cancel_url: Optional[str] = None) -> Dict:
        """
        Create a Plisio invoice for crypto payment
        
        Args:
            amount: Amount in USD
            currency: Crypto currency (USDT, BTC, ETH, etc.)
            order_name: Name/description of the order
            order_number: Unique order identifier
            callback_url: URL for payment notifications
            email: Customer email
            
        Returns:
            Dict with invoice data including wallet address, amount, and invoice URL
        """
        url = f"{PLISIO_API_URL}/invoices/new"
        
        params = {
            "api_key": self.api_key,
            "amount": amount,
            "currency": currency,
            "order_name": order_name,
            "source_currency": source_currency,
            "source_amount": source_amount if source_amount is not None else amount,
        }
        
        if order_number:
            params["order_number"] = order_number
        if callback_url:
            params["callback_url"] = callback_url
        if email:
            params["email"] = email
        if success_url:
            params["success_url"] = success_url
        if cancel_url:
            params["cancel_url"] = cancel_url
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                print(f"Plisio API Response Status: {response.status}")
                print(f"Plisio API Response Headers: {response.headers}")
                
                if response.status != 200:
                    error_text = await response.text()
                    print(f"Plisio API Error Response: {error_text}")
                    return {
                        "success": False,
                        "error": f"API returned status {response.status}: {error_text[:200]}"
                    }
                
                try:
                    data = await response.json()
                except Exception as e:
                    error_text = await response.text()
                    print(f"Failed to parse JSON. Response text: {error_text}")
                    return {
                        "success": False,
                        "error": f"Invalid JSON response: {error_text[:200]}"
                    }
                
                if data.get("status") == "success":
                    return {
                        "success": True,
                        "invoice_url": data["data"].get("invoice_url"),
                        "wallet_address": data["data"].get("wallet_hash"),
                        "amount_crypto": data["data"].get("amount"),
                        "currency": data["data"].get("currency"),
                        "invoice_id": data["data"].get("txn_id"),
                        "qr_code": data["data"].get("qr_code"),
                        "expire_utc": data["data"].get("expire_utc")
                    }
                else:
                    return {
                        "success": False,
                        "error": data.get("data", {}).get("message", "Unknown error")
                    }
    
    async def get_invoice_status(self, invoice_id: str) -> Dict:
        """
        Check the status of a Plisio invoice
        
        Args:
            invoice_id: The invoice/transaction ID
            
        Returns:
            Dict with invoice status
        """
        url = f"{PLISIO_API_URL}/operations/{invoice_id}"
        
        params = {
            "api_key": self.api_key
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                data = await response.json()
                
                if data.get("status") == "success":
                    op_data = data["data"]
                    return {
                        "success": True,
                        "status": op_data.get("status"),
                        "amount": op_data.get("amount"),
                        "currency": op_data.get("currency"),
                        "tx_url": op_data.get("tx_url"),
                        "confirmed": op_data.get("status") == "completed"
                    }
                else:
                    return {
                        "success": False,
                        "error": "Invoice not found"
                    }
    
    async def get_balance(self, currency: str = "USDT") -> Dict:
        """
        Get Plisio wallet balance
        
        Args:
            currency: Crypto currency
            
        Returns:
            Dict with balance info
        """
        url = f"{PLISIO_API_URL}/balances/{currency}"
        
        params = {
            "api_key": self.api_key
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                data = await response.json()
                
                if data.get("status") == "success":
                    return {
                        "success": True,
                        "balance": data["data"].get("balance"),
                        "currency": currency
                    }
                else:
                    return {
                        "success": False,
                        "error": "Could not fetch balance"
                    }
