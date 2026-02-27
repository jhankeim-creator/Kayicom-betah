import hashlib
import hmac
import base64
import logging
from urllib.parse import urlencode

import httpx


class PayerURLHelper:
    API_URL = "https://api-v2.payerurl.com/api/payment"

    def __init__(self, public_key: str, secret_key: str):
        self.public_key = public_key.strip()
        self.secret_key = secret_key.strip()

    def _sign(self, params: dict) -> str:
        sorted_params = dict(sorted(params.items()))
        query_string = urlencode(sorted_params)
        return hmac.new(
            self.secret_key.encode(),
            query_string.encode(),
            hashlib.sha256,
        ).hexdigest()

    def _auth_header(self, params: dict) -> str:
        sig = self._sign(params)
        token = base64.b64encode(f"{self.public_key}:{sig}".encode()).decode()
        return f"Bearer {token}"

    async def create_payment(
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
            "type": "python",
        }

        sorted_params = dict(sorted(params.items()))
        body = urlencode(sorted_params)
        headers = {
            "Authorization": self._auth_header(params),
            "Content-Type": "application/x-www-form-urlencoded",
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(self.API_URL, content=body, headers=headers)
                data = resp.json()
                logging.info(
                    "PayerURL create_payment response: status=%s, data=%s",
                    resp.status_code,
                    data,
                )
                if resp.status_code != 200:
                    return {"success": False, "error": f"HTTP {resp.status_code}: {data}"}
                return data
        except httpx.TimeoutException:
            logging.error("PayerURL create_payment timed out")
            return {"success": False, "error": "Request timed out"}
        except Exception as e:
            logging.error("PayerURL create_payment error: %s", e)
            return {"success": False, "error": str(e)}

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

            verify_params = {
                k: v for k, v in callback_data.items() if k != "authStr"
            }
            sorted_params = dict(sorted(verify_params.items()))
            query_string = urlencode(sorted_params)
            expected_sig = hmac.new(
                secret_key.encode(),
                query_string.encode(),
                hashlib.sha256,
            ).hexdigest()

            return hmac.compare_digest(cb_signature, expected_sig)
        except Exception as e:
            logging.warning("PayerURL callback verification failed: %s", e)
            return False
