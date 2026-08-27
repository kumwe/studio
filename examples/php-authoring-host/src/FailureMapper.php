<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use Throwable;

/** Maps host domain failures to safe canonical failures without leaking causes. */
interface FailureMapper
{
    public function map(Throwable $failure): HostFailure;
}
