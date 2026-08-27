<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

final class RandomCorrelationIdFactory implements CorrelationIdFactory
{
    public function next(): string
    {
        return 'php-authoring/' . bin2hex(random_bytes(16));
    }
}
