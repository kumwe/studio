<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

/**
 * Validates a JSON-compatible value against one exact canonical schema URI.
 *
 * The host implementation must support JSON Schema draft 2020-12, resolve the
 * complete vendored Studio schema tree locally, and fail closed when a schema
 * cannot be loaded or evaluated.
 */
interface SchemaValidator
{
    public function validate(string $schemaReference, mixed $value): bool;
}
