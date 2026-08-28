<?php

declare(strict_types=1);

use Kumwe\Studio\PhpAuthoringHost\AuthoringResponder;
use Kumwe\Studio\PhpAuthoringHost\HttpRequest;
use Kumwe\Studio\PhpAuthoringHost\HttpResponse;
use Kumwe\Studio\PhpAuthoringHost\SameOriginSessionCsrfVerifier;
use Kumwe\Studio\PhpAuthoringHost\StudioDeploymentEmitter;
use Kumwe\Studio\PhpAuthoringHost\TransportSecurityInput;
use Kumwe\Studio\PhpBrowserQualification\QualificationApplication;
use Kumwe\Studio\PhpBrowserQualification\QualificationBoundarySchemaValidator;
use Kumwe\Studio\PhpBrowserQualification\QualificationServer;
use Kumwe\Studio\PhpBrowserQualification\QualificationState;

$repositoryRoot = dirname(__DIR__, 2);
require $repositoryRoot . '/examples/php-authoring-host/src/autoload.php';
require __DIR__ . '/QualificationHost.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($path)) {
    $path = '/';
}

if ($path === '/health') {
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
    echo 'ready';
    return;
}

if ($path === '/studio-browser.js') {
    serveFile(
        $repositoryRoot . '/packages/studio-lit/dist/browser/studio-browser.js',
        'text/javascript; charset=utf-8',
    );
    return;
}

if ($path === '/php-browser-qualification.js') {
    emitHarnessModule();
    return;
}

startQualificationSession();
QualificationState::ensureInitialized($repositoryRoot);

if ($path === '/') {
    QualificationState::reset($repositoryRoot);
    emitQualificationPage();
    return;
}

if ($path === '/e2e/audit') {
    emitJson(QualificationState::exportAudit());
    return;
}

if (
    preg_match('#\A/studio/([a-z][a-z0-9-]*)/ports(?:/|\z)#', $path, $matches) === 1
    && QualificationState::isKnownMount($matches[1])
) {
    $mount = $matches[1];
    $schemas = new QualificationBoundarySchemaValidator();
    $security = new SameOriginSessionCsrfVerifier(
        static function (TransportSecurityInput $input) use ($mount): ?object {
            $authenticated = QualificationServer::sessionCookieIsAuthenticated();
            QualificationState::recordSecurity($mount, $input, $authenticated);
            return $authenticated ? (object) ['id' => 'actors/php-browser-editor'] : null;
        },
        static fn (): string => QualificationState::csrfToken($mount),
        QualificationServer::ORIGIN,
        QualificationState::csrfHeaderName($mount),
        true,
    );
    $responder = new AuthoringResponder(
        new QualificationApplication($mount),
        $schemas,
        $security,
        null,
        null,
        QualificationState::routePrefix($mount),
    );
    $request = HttpRequest::fromGlobals($responder->maximumRequestBytes());
    emitAuthoringResponse($mount, $path, $responder->respond($request));
}

http_response_code(404);
header('Cache-Control: no-store');
header('Content-Type: text/plain; charset=utf-8');
echo 'Not found';

function startQualificationSession(): void
{
    session_name('studio_php_browser_e2e');
    session_set_cookie_params([
        'httponly' => true,
        'path' => '/',
        'samesite' => 'Strict',
        'secure' => false,
    ]);
    if (!session_start()) {
        throw new RuntimeException('The PHP browser qualification session could not start.');
    }
}

function emitQualificationPage(): void
{
    $schemas = new QualificationBoundarySchemaValidator();
    $emitter = new StudioDeploymentEmitter($schemas);
    $mounts = [];
    foreach (QualificationState::mounts() as $mount) {
        $mounts[$mount] = $emitter->render(
            'studio-' . $mount,
            'studio-config-' . $mount,
            QualificationState::deployment($mount),
        );
    }

    header('Cache-Control: no-store');
    header(
        "Content-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'self'; "
            . "style-src 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; "
            . "frame-ancestors 'none'",
    );
    header('Content-Type: text/html; charset=utf-8');
    header('Referrer-Policy: no-referrer');
    header('X-Content-Type-Options: nosniff');

    echo '<!doctype html><html lang="en"><head><meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>Studio PHP browser qualification</title></head><body><main>';
    foreach (QualificationState::mounts() as $mount) {
        echo '<section aria-labelledby="heading-' . $mount . '">';
        echo '<h1 id="heading-' . $mount . '">' . ucfirst($mount) . ' hosted Studio</h1>';
        echo $mounts[$mount];
        echo '</section>';
    }
    echo '<div aria-label="Qualification lifecycle controls">';
    echo '<button id="reopen-alpha" type="button">Reopen alpha</button>';
    echo '<button id="dispose-alpha" type="button">Dispose alpha</button>';
    echo '<button id="dispose-beta" type="button">Dispose beta</button>';
    echo '</div></main>';
    echo '<script type="module" src="/php-browser-qualification.js"></script>';
    echo '</body></html>';
}

function emitJson(mixed $value): void
{
    header('Cache-Control: no-store');
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function serveFile(string $path, string $contentType): void
{
    if (!is_file($path)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Build the Studio browser asset before running this lane.';
        return;
    }
    header('Cache-Control: no-store');
    header('Content-Type: ' . $contentType);
    header('X-Content-Type-Options: nosniff');
    readfile($path);
}

function emitAuthoringResponse(string $mount, string $path, HttpResponse $response): never
{
    $attack = QualificationState::responseAttack($mount);
    if ($attack === null || !str_ends_with($path, '/authoring/resolve-target')) {
        $response->emit();
    }

    http_response_code(200);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    if ($attack === 'missing-content-type') {
        ini_set('default_mimetype', '');
        header_remove('Content-Type');
        echo $response->body;
        exit;
    }
    if ($attack === 'wrong-content-type') {
        header('Content-Type: text/plain; charset=utf-8');
        echo $response->body;
        exit;
    }
    if ($attack === 'duplicate-json-member') {
        $document = json_decode($response->body, false, 128, JSON_THROW_ON_ERROR);
        if (!($document instanceof stdClass) || !property_exists($document, 'value')) {
            throw new RuntimeException('Expected a successful authoring result to corrupt.');
        }
        $value = json_encode(
            $document->value,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        );
        header('Content-Type: application/json; charset=utf-8');
        echo '{"value":null,"value":' . $value . '}';
        exit;
    }
    if ($attack === 'oversized-json') {
        $body = '{"value":{"padding":"' . str_repeat('A', 2_048) . '"}}';
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Length: ' . strlen($body));
        echo $body;
        exit;
    }

    throw new RuntimeException('Unknown configured PHP response attack.');
}

function emitHarnessModule(): void
{
    header('Cache-Control: no-store');
    header('Content-Type: text/javascript; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo <<<'JAVASCRIPT'
import { autoMountStudio, mountStudioFromConfigElement } from '/studio-browser.js';

const report = await autoMountStudio();
const handles = new Map(report.handles.map((handle) => [handle.instanceId, handle]));

async function reopenAlpha() {
  const current = handles.get('php-e2e-alpha');
  if (current !== undefined) await current.dispose();
  const handle = await mountStudioFromConfigElement('studio-config-alpha');
  handles.set('php-e2e-alpha', handle);
}

async function disposeAlpha() {
  const current = handles.get('php-e2e-alpha');
  if (current === undefined) return;
  await current.dispose();
  handles.delete('php-e2e-alpha');
}

async function disposeBeta() {
  const current = handles.get('php-e2e-beta');
  if (current === undefined) return;
  await current.dispose();
  handles.delete('php-e2e-beta');
}

document.querySelector('#reopen-alpha')?.addEventListener('click', () => {
  void reopenAlpha();
});
document.querySelector('#dispose-alpha')?.addEventListener('click', () => {
  void disposeAlpha();
});
document.querySelector('#dispose-beta')?.addEventListener('click', () => {
  void disposeBeta();
});

document.documentElement.dataset.phpMountSuccessCount = String(report.handles.length);
document.documentElement.dataset.phpMountFailureCount = String(report.failures.length);
document.documentElement.dataset.phpMountFailures = JSON.stringify(
  report.failures.map((failure) => {
    const reason = failure.error;
    const hostError =
      typeof reason === 'object' && reason !== null && 'error' in reason ? reason.error : undefined;
    return {
      instanceId: failure.instanceId,
      category:
        typeof hostError === 'object' && hostError !== null && 'category' in hostError
          ? hostError.category
          : undefined,
      messageKey:
        typeof hostError === 'object' &&
        hostError !== null &&
        'message' in hostError &&
        typeof hostError.message === 'object' &&
        hostError.message !== null &&
        'key' in hostError.message
          ? hostError.message.key
          : undefined,
      retryable:
        typeof hostError === 'object' && hostError !== null && 'retryable' in hostError
          ? hostError.retryable
          : undefined,
      revision:
        typeof hostError === 'object' && hostError !== null && 'revision' in hostError
          ? hostError.revision
          : undefined,
    };
  }),
);
document.documentElement.dataset.phpMountReady = 'true';
JAVASCRIPT;
}
