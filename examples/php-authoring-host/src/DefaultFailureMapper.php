<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use Throwable;

final class DefaultFailureMapper implements FailureMapper
{
    public function map(Throwable $failure): HostFailure
    {
        return $failure instanceof HostFailure ? $failure : HostFailure::internal();
    }
}
