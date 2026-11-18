import type { AppSyncResolverHandler } from 'aws-lambda';
import {
  ConnectClient,
  StartChatContactCommand,
  StartWebRTCContactCommand,
} from '@aws-sdk/client-connect';

const connect = new ConnectClient({ region: process.env.CONNECT_REGION || 'us-east-1' });

interface StartConnectArgs {
  channel: string;
  customerIdentifier: string;
  plateNumber: string;
  locationGeohash: string;
}

export const handler: AppSyncResolverHandler<StartConnectArgs, any> = async (event) => {
  const { channel, customerIdentifier, plateNumber, locationGeohash } = event.arguments;
  const instanceId    = process.env.CONNECT_INSTANCE_ID!;
  const contactFlowId = process.env.CONNECT_CONTACT_FLOW_ID!;

  const attributes = {
    customerIdentifier: customerIdentifier || 'unknown',
    plateNumber:        plateNumber        || 'unknown',
    locationGeohash:    locationGeohash    || 'thev0z',
    channelType:        channel,
  };

  // ── VOICE (WebRTC) ────────────────────────────────────────────────────────
  // Creates a real VOICE contact via StartWebRTCContact.
  // Returns ConnectionData: { Meeting: { MeetingId, MediaPlacement, ... },
  //                           Attendee: { AttendeeId, JoinToken } }
  // The browser uses this with the Amazon Chime SDK to join the audio channel.
  // The contact flows through RoadAssistance-1 → ConnectParticipantWithAgenticCX
  // (SAM1610) which handles voice with AMAZON_AGENTIC_VOICE engine + KATIE TTS.
  if (channel === 'WEBRTC') {
    const webrtcRes = await connect.send(
      new StartWebRTCContactCommand({
        InstanceId:         instanceId,
        ContactFlowId:      contactFlowId,
        ParticipantDetails: { DisplayName: customerIdentifier || 'Customer' },
        Attributes:         attributes,
      })
    );

    // ConnectionData shape from AWS SDK:
    // { Attendee: { AttendeeId, JoinToken }, Meeting: { MeetingId, MediaPlacement, ... } }
    const cd = webrtcRes.ConnectionData as any ?? {};
    console.log('[StartWebRTCContact] ContactId:', webrtcRes.ContactId);
    console.log('[StartWebRTCContact] ConnectionData keys:', Object.keys(cd));

    return {
      contactId: webrtcRes.ContactId || '',
      connectionDataJson: JSON.stringify({
        Meeting:  cd.Meeting  ?? null,
        Attendee: cd.Attendee ?? null,
      }),
    };
  }

  // ── CHAT ──────────────────────────────────────────────────────────────────
  // Creates a CHAT contact. The Connect widget (amazon_connect('open')) also
  // creates its own chat contact independently — this Lambda path is used when
  // the widget is not yet loaded (fallback) or for the ACXD pipeline trigger.
  const chatRes = await connect.send(
    new StartChatContactCommand({
      InstanceId:         instanceId,
      ContactFlowId:      contactFlowId,
      ParticipantDetails: { DisplayName: customerIdentifier || 'Customer' },
      Attributes:         attributes,
    })
  );

  return {
    contactId: chatRes.ContactId || '',
    connectionDataJson: JSON.stringify({
      ParticipantId:    chatRes.ParticipantId,
      ParticipantToken: chatRes.ParticipantToken,
    }),
  };
};
