<?php

declare(strict_types=1);

use Kumwe\Studio\PhpAuthoringHost\AuthoringResponder;
use Kumwe\Studio\PhpAuthoringHost\HttpRequest;
use Kumwe\Studio\PhpAuthoringHost\HttpResponse;

require dirname(__DIR__) . '/src/autoload.php';

try {
    $bootstrap = getenv('STUDIO_PHP_BOOTSTRAP');
    if (!is_string($bootstrap) || $bootstrap === '' || !is_file($bootstrap)) {
        throw new RuntimeException('STUDIO_PHP_BOOTSTRAP must name the host composition root.');
    }

    $responder = require $bootstrap;
    if (!($responder instanceof AuthoringResponder)) {
        throw new RuntimeException('The host composition root must return AuthoringResponder.');
    }

    $request = HttpRequest::fromGlobals($responder->maximumRequestBytes());
    $responder->respond($request)->emit();
} catch (Throwable) {
    HttpResponse::emergencyInternal()->emit();
}
