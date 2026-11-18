"""
sma_handler.py — SIP Media Application Lambda
Bridges inbound Etisalcom BYOC calls into Amazon Connect RoadAssistance-1

Connect instance : 7fc2e91f-1df5-4ecc-b4c6-b2635f9a7dd6
Contact flow     : RoadAssistance-1 (2c776546-4a3f-4c5e-8d9a-7a16e1a6dadf)
Account          : 559846026818
Region           : us-east-1
"""

import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CONNECT_INSTANCE_ARN = (
    "arn:aws:connect:us-east-1:559846026818:"
    "instance/7fc2e91f-1df5-4ecc-b4c6-b2635f9a7dd6"
)
CONTACT_FLOW_ARN = (
    "arn:aws:connect:us-east-1:559846026818:"
    "instance/7fc2e91f-1df5-4ecc-b4c6-b2635f9a7dd6/"
    "contact-flow/2c776546-4a3f-4c5e-8d9a-7a16e1a6dadf"
)


def lambda_handler(event, context):
    logger.info("SMA Event: %s", json.dumps(event, indent=2))

    event_type   = event.get("InvocationEventType", "UNKNOWN")
    call_details = event.get("CallDetails", {})
    transaction_id = call_details.get("TransactionId", "unknown")
    participants   = call_details.get("Participants", [])

    # Log caller info
    caller_num = "unknown"
    if participants:
        caller_num = participants[0].get("From", "unknown")
    logger.info("Event=%s | TxID=%s | From=%s", event_type, transaction_id, caller_num)

    actions = []

    if event_type == "NEW_INBOUND_CALL":
        logger.info("Bridging call from %s into Amazon Connect RoadAssistance-1", caller_num)
        actions = [
            {
                "Type": "Bridge",
                "Parameters": {
                    "CallTimeoutSeconds": "30",
                    "CallerIdNumber": caller_num,
                    "Endpoints": [
                        {
                            "Type": "AWS",
                            "AwsService": "CONNECT",
                            "Uri": CONNECT_INSTANCE_ARN,
                            "Attributes": {
                                "ContactFlowId": CONTACT_FLOW_ARN
                            }
                        }
                    ]
                }
            }
        ]

    elif event_type == "HANGUP":
        logger.info("Call ended — TxID=%s", transaction_id)
        actions = []

    elif event_type == "CALL_ANSWERED":
        logger.info("Call answered — TxID=%s", transaction_id)
        actions = []

    else:
        logger.warning("Unhandled event type: %s", event_type)
        actions = []

    response = {
        "SchemaVersion": "1.0",
        "Actions": actions
    }
    logger.info("Returning: %s", json.dumps(response))
    return response
