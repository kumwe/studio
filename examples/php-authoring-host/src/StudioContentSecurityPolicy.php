<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use InvalidArgumentException;
use JsonException;
use RuntimeException;
use stdClass;

/** Renders the archive-published CSP template with one fresh response nonce. */
final class StudioContentSecurityPolicy
{
    public const PROFILE = 'same-origin-http';
    public const STYLE_NONCE_PLACEHOLDER = '{{STYLE_NONCE}}';
    public const HEADER_TEMPLATE = "default-src 'none'; script-src 'self'; require-trusted-types-for 'script'; "
        . "trusted-types lit-html; style-src 'self' 'nonce-{{STYLE_NONCE}}'; img-src 'self' data:; "
        . "font-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'none'; frame-src 'none'; "
        . "manifest-src 'none'; object-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";

    public static function fromAssetManifestFile(string $manifestPath, string $styleNonce): string
    {
        self::assertStyleNonce($styleNonce);
        $bytes = @file_get_contents($manifestPath);
        if (!is_string($bytes)) {
            throw new RuntimeException('The Studio browser asset manifest could not be read.');
        }

        try {
            $manifest = json_decode($bytes, false, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException $failure) {
            throw new RuntimeException('The Studio browser asset manifest is not valid JSON.', 0, $failure);
        }
        if (!($manifest instanceof stdClass)) {
            throw new RuntimeException('The Studio browser asset manifest must be an object.');
        }

        $policy = $manifest->contentSecurityPolicy ?? null;
        $style = $policy instanceof stdClass ? ($policy->styleNonce ?? null) : null;
        $configuration = $policy instanceof stdClass
            ? ($policy->inertConfigurationScript ?? null)
            : null;
        if (
            !($policy instanceof stdClass)
            || ($policy->profile ?? null) !== self::PROFILE
            || ($policy->headerTemplate ?? null) !== self::HEADER_TEMPLATE
            || !($style instanceof stdClass)
            || ($style->placeholder ?? null) !== self::STYLE_NONCE_PLACEHOLDER
            || ($style->minimumEntropyBits ?? null) !== 128
            || ($style->scope ?? null) !== 'response'
            || !($configuration instanceof stdClass)
            || ($configuration->element ?? null) !== 'script'
            || ($configuration->mediaType ?? null) !== 'application/json'
            || ($configuration->requiresHash ?? null) !== false
            || ($configuration->requiresNonce ?? null) !== false
            || substr_count(self::HEADER_TEMPLATE, self::STYLE_NONCE_PLACEHOLDER) !== 1
        ) {
            throw new RuntimeException('The Studio browser asset manifest has an unsupported CSP contract.');
        }

        return str_replace(self::STYLE_NONCE_PLACEHOLDER, $styleNonce, self::HEADER_TEMPLATE);
    }

    private static function assertStyleNonce(string $styleNonce): void
    {
        $base64Value = rtrim($styleNonce, '=');
        $suppliedPadding = strlen($styleNonce) - strlen($base64Value);
        $remainder = strlen($base64Value) % 4;
        $canonicalPadding = $remainder === 0 ? 0 : 4 - $remainder;
        $decoded = $remainder === 1
            ? false
            : base64_decode(
                strtr($base64Value, '-_', '+/') . str_repeat('=', $canonicalPadding),
                true,
            );
        if (
            strlen($styleNonce) > 344
            || preg_match('/\A[A-Za-z0-9+\/_-]+={0,2}\z/D', $styleNonce) !== 1
            || ($suppliedPadding !== 0 && $suppliedPadding !== $canonicalPadding)
            || !is_string($decoded)
            || strlen($decoded) < 16
        ) {
            throw new InvalidArgumentException(
                'The Studio style nonce must be a 128-bit-or-stronger base64-style token.',
            );
        }
    }
}
