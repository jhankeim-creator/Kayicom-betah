import hashlib
import hmac
import base64
import json
import logging
import requests


class PayerURLHelper:
    API_URL = "https://api-v2.payerurl.com/api/payment"

    def __init__(self, public_key: str, secret_key: str):
        self.public_key = public_key.strip()
        self.secret_key = secret_key.strip()

    def _sign(self, params: dict) -> str:
        sorted_keys = sorted(params.keys())
        values = "".join(str(params[k]) for k in sorted_keys)
        sig = hmac.new(
            self.secret_key.encode(),
            values.encode(),
            hashlib.sha256,
        ).hexdigest()
        return sig

    def _auth_header(self, params: dict) -> str:
        sig = self._sign(params)
        token = base64.b64encode(f"{self.public_key}:{sig}".encode()).decode()
        return f"Bearer {token}"

    def create_payment(
        self,
        order_id: str,
        amount: float,
        currency: str,
        customer_name: str,
        customer_email: str,
        redirect_url: str,
        notify_url: str,
        cancel_url: str,
        items: str = "Digital Product",
    ) -> dict:
        name_parts = (customer_name or "Customer").split(" ", 1)
        fname = name_parts[0]
        lname = name_parts[1] if len(name_parts) > 1 else ""

        params = {
            "order_id": str(order_id),
            "amount": str(round(amount, 2)),
            "currency": currency.upper(),
            "billing_fname": fname,
            "billing_lname": lname,
            "billing_email": customer_email,
            "redirect_to": redirect_url,
            "notify_url": notify_url,
            "cancel_url": cancel_url,
            "items": items,
        }

        headers = {
            "Authorization": self._auth_header(params),
            "Content-Type": "application/json",
        }

        resp = requests.post(self.API_URL, json=params, headers=headers, timeout=30)
        data = resp.json()
        logging.info(f"PayerURL create_payment response: status={resp.status_code}, data={data}")
        return data

    @staticmethod
    def verify_callback(public_key: str, secret_key: str, callback_data: dict) -> bool:
        auth_str = callback_data.get("authStr", "")
        if not auth_str:
            return False
        try:
            decoded = base64.b64decode(auth_str).decode()
            parts = decoded.split(":", 1)
            if len(parts) != 2:
                return False
            cb_public_key, cb_signature = parts
            if cb_public_key != public_key:
                return False
            return True
        except Exception as e:
            logging.warning(f"PayerURL callback verification failed: {e}")
            return False
