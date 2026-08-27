<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

/**
 * Authenticates trusted cookie/Authorization evidence and verifies CSRF,
 * exact-origin, fetch-metadata, or signed-service request integrity.
 * Resource authorization remains an application-service responsibility.
 */
interface TransportSecurityVerifier
{
    public function verify(TransportSecurityInput $input): TransportSecurityDecision;
}
