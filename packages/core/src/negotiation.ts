import type { HostCapabilities, QualifiedName, StudioDiagnostic } from '@kumwe/studio-protocol';
import { STUDIO_WIRE_PROTOCOL_VERSION } from '@kumwe/studio-protocol';

export interface CapabilityNegotiationOptions {
  optionalPorts?: readonly QualifiedName[];
  requiredPorts?: readonly QualifiedName[];
  supportedProtocolVersions?: readonly string[];
}

export interface CapabilityNegotiationResult {
  availablePorts: QualifiedName[];
  diagnostics: StudioDiagnostic[];
  missingOptionalPorts: QualifiedName[];
  missingRequiredPorts: QualifiedName[];
  protocolVersion?: string;
  sessionState: 'editable' | 'read-only';
}

const DEFAULT_REQUIRED_PORTS: readonly QualifiedName[] = ['studio.port/artifact'];

/**
 * Resolve one session posture from a host capability document. Capability
 * negotiation fails closed: without a common wire protocol version or a
 * required port there is no editable session, only a diagnosable read-only
 * one. Optional ports degrade with informational diagnostics instead of
 * being silently assumed.
 */
export function negotiateCapabilities(
  capabilities: HostCapabilities,
  options: Readonly<CapabilityNegotiationOptions> = {},
): CapabilityNegotiationResult {
  const supportedVersions = options.supportedProtocolVersions ?? [STUDIO_WIRE_PROTOCOL_VERSION];
  const requiredPorts = options.requiredPorts ?? DEFAULT_REQUIRED_PORTS;
  const optionalPorts = options.optionalPorts ?? [];

  const diagnostics: StudioDiagnostic[] = [];
  const availablePorts = capabilities.ports.map((port) => port.id);
  const available = new Set<QualifiedName>(availablePorts);

  const protocolVersion = supportedVersions.find((version) =>
    capabilities.protocolVersions.includes(version),
  );
  if (protocolVersion === undefined) {
    diagnostics.push({
      code: 'studio.host/no-common-protocol-version',
      message: {
        defaultMessage: 'Studio and the host share no wire protocol version.',
        key: 'studio.host/no-common-protocol-version',
      },
      severity: 'blocking',
    });
  }

  const missingRequiredPorts = requiredPorts.filter((port) => !available.has(port));
  for (const port of missingRequiredPorts) {
    diagnostics.push({
      code: 'studio.host/missing-required-port',
      message: {
        defaultMessage: `The host does not provide the required ${port} port.`,
        key: 'studio.host/missing-required-port',
      },
      parameters: { port },
      severity: 'blocking',
    });
  }

  const missingOptionalPorts = optionalPorts.filter((port) => !available.has(port));
  for (const port of missingOptionalPorts) {
    diagnostics.push({
      code: 'studio.host/missing-optional-port',
      message: {
        defaultMessage: `The optional ${port} port is unavailable; its features are disabled.`,
        key: 'studio.host/missing-optional-port',
      },
      parameters: { port },
      severity: 'information',
    });
  }

  const editable = protocolVersion !== undefined && missingRequiredPorts.length === 0;
  const result: CapabilityNegotiationResult = {
    availablePorts,
    diagnostics,
    missingOptionalPorts,
    missingRequiredPorts,
    sessionState: editable ? 'editable' : 'read-only',
  };
  if (protocolVersion !== undefined) {
    result.protocolVersion = protocolVersion;
  }
  return result;
}
