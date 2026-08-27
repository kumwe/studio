<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use stdClass;

/**
 * Host-owned contextual authoring use cases.
 *
 * Each return value is the exact operation value; AuthoringResponder creates
 * the canonical {"value": ...} result envelope and validates it. Implementors
 * map the stdClass request into domain commands/queries and must independently
 * authorize the authenticated principal and canonical resource context.
 *
 * `start` and the three saves must bind AuthoringCallContext::idempotencyKey()
 * to the canonical intent and accepted result atomically. The save methods
 * must validate the complete plan-bound reusable-type/Model/Blueprint/Entry
 * coordinate set inside their transaction. They must not use or invent an
 * outer expectedRevision for these contextual operations.
 */
interface AuthoringApplicationService
{
    public function resolveTarget(stdClass $request, AuthoringCallContext $context): mixed;

    public function listTypes(stdClass $query, AuthoringCallContext $context): mixed;

    public function start(stdClass $request, AuthoringCallContext $context): mixed;

    public function planSave(stdClass $intent, AuthoringCallContext $context): mixed;

    public function saveItem(stdClass $request, AuthoringCallContext $context): mixed;

    public function saveNewTypeVersion(stdClass $request, AuthoringCallContext $context): mixed;

    public function saveAsNewType(stdClass $request, AuthoringCallContext $context): mixed;
}
