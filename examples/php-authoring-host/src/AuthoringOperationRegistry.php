<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

final class AuthoringOperationRegistry
{
    /** @return array<string, AuthoringOperation> keyed by canonical route */
    public static function all(): array
    {
        static $operations;
        if (is_array($operations)) {
            return $operations;
        }

        $operations = [];
        foreach (
            [
                new AuthoringOperation(
                    'authoring/resolve-target',
                    'studio.operation/authoring.resolve-target',
                    'resolveTarget',
                    'request',
                    false,
                    false,
                    true,
                ),
                new AuthoringOperation(
                    'authoring/list-types',
                    'studio.operation/authoring.list-types',
                    'listTypes',
                    'query',
                    false,
                    false,
                    true,
                ),
                new AuthoringOperation(
                    'authoring/start',
                    'studio.operation/authoring.start',
                    'start',
                    'request',
                    true,
                    true,
                    true,
                ),
                new AuthoringOperation(
                    'authoring/plan-save',
                    'studio.operation/authoring.plan-save',
                    'planSave',
                    'intent',
                    false,
                    false,
                    false,
                ),
                new AuthoringOperation(
                    'authoring/save-item',
                    'studio.operation/authoring.save-item',
                    'saveItem',
                    'request',
                    true,
                    true,
                    false,
                ),
                new AuthoringOperation(
                    'authoring/save-new-type-version',
                    'studio.operation/authoring.save-new-type-version',
                    'saveNewTypeVersion',
                    'request',
                    true,
                    true,
                    false,
                ),
                new AuthoringOperation(
                    'authoring/save-as-new-type',
                    'studio.operation/authoring.save-as-new-type',
                    'saveAsNewType',
                    'request',
                    true,
                    true,
                    false,
                ),
            ] as $operation
        ) {
            $operations[$operation->route] = $operation;
        }

        return $operations;
    }

    public static function find(string $route): ?AuthoringOperation
    {
        return self::all()[$route] ?? null;
    }
}
