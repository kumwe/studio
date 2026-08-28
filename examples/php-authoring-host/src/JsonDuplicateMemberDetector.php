<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use InvalidArgumentException;
use JsonException;

/**
 * Rejects ambiguous JSON before the platform decoder discards duplicate object
 * members. Invalid JSON is deliberately treated as unsafe.
 */
final class JsonDuplicateMemberDetector
{
    private int $offset = 0;
    private readonly int $length;

    private function __construct(
        private readonly string $json,
        private readonly int $maximumDepth,
    ) {
        $this->length = strlen($json);
    }

    /**
     * Returns true only for one complete, valid JSON value whose objects have
     * unique decoded member names. Malformed JSON and duplicate members both
     * fail closed with false.
     */
    public static function isDuplicateFree(string $json, int $maximumDepth = 128): bool
    {
        if ($maximumDepth < 1 || $maximumDepth > 512) {
            throw new InvalidArgumentException('maximumDepth must be between 1 and 512.');
        }

        $detector = new self($json, $maximumDepth);
        if (!$detector->parseValue(1)) {
            return false;
        }

        $detector->skipWhitespace();
        return $detector->offset === $detector->length;
    }

    private function parseValue(int $depth): bool
    {
        $this->skipWhitespace();
        if ($this->offset >= $this->length) {
            return false;
        }

        return match ($this->json[$this->offset]) {
            '{' => $this->parseObject($depth),
            '[' => $this->parseArray($depth),
            '"' => $this->parseString(),
            't' => $this->parseLiteral('true'),
            'f' => $this->parseLiteral('false'),
            'n' => $this->parseLiteral('null'),
            default => $this->parseNumber(),
        };
    }

    private function parseObject(int $depth): bool
    {
        if ($depth > $this->maximumDepth) {
            return false;
        }

        $this->offset++;
        $this->skipWhitespace();
        if ($this->consume('}')) {
            return true;
        }

        /** @var array<string, true> $memberNames */
        $memberNames = [];
        while (true) {
            $memberName = null;
            if (!$this->parseString($memberName)) {
                return false;
            }

            // Prefixing the byte length prevents PHP from coercing numeric
            // string member names into integer array keys.
            $memberKey = strlen($memberName) . ':' . $memberName;
            if (isset($memberNames[$memberKey])) {
                return false;
            }
            $memberNames[$memberKey] = true;

            $this->skipWhitespace();
            if (!$this->consume(':') || !$this->parseValue($depth + 1)) {
                return false;
            }

            $this->skipWhitespace();
            if ($this->consume('}')) {
                return true;
            }
            if (!$this->consume(',')) {
                return false;
            }
            $this->skipWhitespace();
        }
    }

    private function parseArray(int $depth): bool
    {
        if ($depth > $this->maximumDepth) {
            return false;
        }

        $this->offset++;
        $this->skipWhitespace();
        if ($this->consume(']')) {
            return true;
        }

        while (true) {
            if (!$this->parseValue($depth + 1)) {
                return false;
            }

            $this->skipWhitespace();
            if ($this->consume(']')) {
                return true;
            }
            if (!$this->consume(',')) {
                return false;
            }
        }
    }

    private function parseString(?string &$decoded = null): bool
    {
        if (!$this->consume('"')) {
            return false;
        }

        $start = $this->offset - 1;
        while ($this->offset < $this->length) {
            $character = $this->json[$this->offset];
            if ($character === '"') {
                $this->offset++;
                $token = substr($this->json, $start, $this->offset - $start);
                try {
                    $value = json_decode($token, true, 2, JSON_THROW_ON_ERROR);
                } catch (JsonException) {
                    return false;
                }
                if (!is_string($value)) {
                    return false;
                }
                $decoded = $value;
                return true;
            }

            if ($character === '\\') {
                $this->offset++;
                if ($this->offset >= $this->length) {
                    return false;
                }
                $escape = $this->json[$this->offset];
                if ($escape === 'u') {
                    if ($this->offset + 4 >= $this->length) {
                        return false;
                    }
                    for ($index = 1; $index <= 4; $index++) {
                        if (!$this->isHexDigit($this->json[$this->offset + $index])) {
                            return false;
                        }
                    }
                    $this->offset += 5;
                    continue;
                }
                if (!str_contains('"\\/bfnrt', $escape)) {
                    return false;
                }
                $this->offset++;
                continue;
            }

            if (ord($character) < 0x20) {
                return false;
            }
            $this->offset++;
        }

        return false;
    }

    private function parseNumber(): bool
    {
        $start = $this->offset;
        $this->consume('-');
        if ($this->offset >= $this->length) {
            return false;
        }

        if ($this->consume('0')) {
            // A following digit is rejected by the enclosing delimiter check.
        } elseif ($this->isDigitOneToNine($this->json[$this->offset])) {
            $this->offset++;
            while ($this->offset < $this->length && $this->isDigit($this->json[$this->offset])) {
                $this->offset++;
            }
        } else {
            return false;
        }

        if ($this->consume('.')) {
            if ($this->offset >= $this->length || !$this->isDigit($this->json[$this->offset])) {
                return false;
            }
            while ($this->offset < $this->length && $this->isDigit($this->json[$this->offset])) {
                $this->offset++;
            }
        }

        if (
            $this->offset < $this->length
            && ($this->json[$this->offset] === 'e' || $this->json[$this->offset] === 'E')
        ) {
            $this->offset++;
            if (
                $this->offset < $this->length
                && ($this->json[$this->offset] === '+' || $this->json[$this->offset] === '-')
            ) {
                $this->offset++;
            }
            if ($this->offset >= $this->length || !$this->isDigit($this->json[$this->offset])) {
                return false;
            }
            while ($this->offset < $this->length && $this->isDigit($this->json[$this->offset])) {
                $this->offset++;
            }
        }

        return $this->offset > $start;
    }

    private function parseLiteral(string $literal): bool
    {
        if (substr_compare($this->json, $literal, $this->offset, strlen($literal)) !== 0) {
            return false;
        }

        $this->offset += strlen($literal);
        return true;
    }

    private function skipWhitespace(): void
    {
        while ($this->offset < $this->length) {
            $character = $this->json[$this->offset];
            if ($character !== ' ' && $character !== "\t" && $character !== "\r" && $character !== "\n") {
                return;
            }
            $this->offset++;
        }
    }

    private function consume(string $expected): bool
    {
        if ($this->offset >= $this->length || $this->json[$this->offset] !== $expected) {
            return false;
        }

        $this->offset++;
        return true;
    }

    private function isDigit(string $character): bool
    {
        return $character >= '0' && $character <= '9';
    }

    private function isDigitOneToNine(string $character): bool
    {
        return $character >= '1' && $character <= '9';
    }

    private function isHexDigit(string $character): bool
    {
        return $this->isDigit($character)
            || ($character >= 'a' && $character <= 'f')
            || ($character >= 'A' && $character <= 'F');
    }
}
