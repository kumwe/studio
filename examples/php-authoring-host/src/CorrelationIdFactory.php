<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

interface CorrelationIdFactory
{
    /** Return a canonical Studio stableId containing no credential or resource value. */
    public function next(): string;
}
