---
'@kumwe/studio-testkit': patch
---

Align the published reference-host fixtures and integration documentation with the renamed Kumwe App
core at `kumwe/app`. Example capability and session documents now identify the host as
`org.kumwe/app`, and the first-party integration profile is named `kumwe-app`. The integration
playbook also records that frozen manifest 5 / SPI 3 paraphrases all six contribution families rather
than carrying canonical Studio resources. Kumwe App must preserve that legacy boundary and add
manifest 6 / SPI 4 with canonical `block-definition`, `pattern`, `field-adapter`, `inspector`,
`design-vocabulary`, and `migration` documents, separate host binding metadata, exact schema/corpus
validation, and only deterministic lossless legacy adaptation.
