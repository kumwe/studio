# Production capability matrix

Studio models author intent once. Similar UI names are a semantic block with a bounded presentation,
a reusable inspector capability, or trusted disposable renderer behavior; they are not cloned blocks
with arbitrary CSS and JavaScript.

| Required capability                                                      | Canonical Studio ownership                                                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Article and containers                                                   | `article`, `section`, `stack`, `grid`, `columns`                                                                            |
| Alerts, messages, notifications, comments                                | `notice` with information, success, warning, error, or comment tone                                                         |
| Background, cover, text overlay                                          | `cover` with a media-reference port and bounded overlay/alignment                                                           |
| Badges and labels                                                        | `badge` and `label`                                                                                                         |
| Breadcrumbs, navbar, nav, subnav, thumbnav, dot-nav, pagination, dropnav | `navigation` plus recursive `navigation-item` and a closed presentation enum                                                |
| Buttons and to-top links                                                 | `call-to-action`; `href="#top"` is the portable to-top form                                                                 |
| Cards                                                                    | `card`                                                                                                                      |
| Countdown                                                                | `countdown` plus trusted timer enhancement and semantic `time` fallback                                                     |
| Description list                                                         | `description-list` plus `description-item`                                                                                  |
| Divider                                                                  | `divider`                                                                                                                   |
| Dropdown, dropbar, tooltip                                               | `popover` presentations; native disclosure remains the no-script fallback                                                   |
| Filter and search                                                        | GET-only `search`; host query filtering remains a read-only binding on content collections                                  |
| Flex and grid                                                            | `stack`, `grid`, and `columns`                                                                                              |
| Heading and text                                                         | `heading` and `rich-text`                                                                                                   |
| Icons, sprites, SVG                                                      | `icon` names a theme sprite token; `image` uses host media; `drawing` owns bounded vector strokes; raw SVG is not persisted |
| Images, audio, video, attachments, upload                                | Media blocks and Studio media controls; upload is authoring/host behavior, not a delivery block                             |
| Lightbox                                                                 | `gallery.lightbox` plus trusted focus-managed dialog enhancement                                                            |
| Modal, offcanvas, overlay                                                | `dialog.presentation` plus native disclosure fallback and trusted focus management                                          |
| Progress and spinner                                                     | `progress` and `spinner`                                                                                                    |
| Slider, slideshow, slidenav                                              | `gallery.presentation="slideshow"` plus trusted navigation behavior                                                         |
| Sortable                                                                 | Ordered slots and Studio move commands; it is an authoring capability, not persisted delivery JavaScript                    |
| Switcher and tabs                                                        | `tabs` plus `tab`                                                                                                           |
| Table                                                                    | `table` with canonical bounded text-only table data                                                                         |
| Toggle                                                                   | Native dialog/popover disclosure triggers and call-to-action links                                                          |

Every block has the reusable `studio.control/presentation` inspector. Its `design` intent covers
alignment, renderer-owned motion/transition/parallax, height/width, inverse color roles,
margin/padding, markers, flow/relative/sticky position, print selection, scrolling, and responsive
visibility. Raw HTML goes through structural safe-markup policy; raw CSS is limited to the separate
trusted scoped-style boundary; authored JavaScript is never accepted.
