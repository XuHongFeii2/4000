# Vector Illustration Style

## Style ID
vector-illustration

## Style Name
Vector Illustration Style PPT

## Compatible Models
- Nano Banana Pro (gemini-3-pro-image-preview)
- Notebookml
- Youmind
- Listenhub
- Lovart

## Style Description
Flat vector illustration style with clear black outlines and a retro, soft color scheme. Emphasizes geometric simplification and a toy-model-like cuteness.

## Base Prompt Template

You are an expert-level illustration designer. Please generate a 16:9 vector illustration style presentation slide.

**Visual Style and Art Direction**

Illustration style: Flat Vector Illustration. Must include clear, uniformly thick black outlines (Monoline/Stroke). Color fills should be clean, using only minimal shadows. Gradient colors or 3D rendering effects are strictly prohibited.

Composition format: Horizontal panoramic composition (Panoramic), occupying the top 1/3 of the layout.

Line Work: Must use uniformly thick black single-line strokes (Monoline/Uniform Stroke). All objects (buildings, plants, clouds) must have closed black outlines, similar to coloring book line art style. Line endings should be rounded, avoiding sharp corners.

Geometric Simplification: Simplify complex objects into basic geometric shapes. For example, trees simplified to lollipop shapes or triangles, buildings simplified to simple rectangular blocks, windows simplified to neat small grid patterns. Don't pursue realistic details; aim for a "toy model"-like cuteness.

Space and Perspective: Use eye-level or slightly elevated 2.5D perspective (similar to isometric but more flexible). Express depth through layer overlap, don't use atmospheric perspective (distant objects shouldn't become blurry or faded), all layers should have consistent clarity.

Decorative Elements: Add decorative geometric elements in empty spaces, such as radiating lines (representing sunlight or energy), pill-shaped clouds, or simple dots and stars, to balance the visual density of the image.

**Color Scheme**

Background: Cream/Off-white paper texture base color.

Accent colors: Coral red, mint green, mustard yellow, burnt orange, and rock blue. Retro and soft tones.

**Typography**

Main title: Large, bold retro serif font (Retro Serif), conveying authority and elegance.

Subtitle: All-caps sans-serif within rectangular color blocks.

Body text: Clear, readable geometric sans-serif font.

## Page Type Templates

### Cover Page Template
Composition logic: Main title uses large retro serif font, occupying the center of the frame. The top 1/3 area features a horizontal panoramic vector illustration scene, including simplified geometric buildings, toy-like trees, and decorative elements. Background uses cream/off-white paper texture.

Use case: First page of PPT, displaying title and theme.

### Content Page Template
Composition logic: Top area retains horizontal illustration decorative band. Content area uses geometric icons and small vector illustrations alongside text, all elements with uniformly thick black outlines. Colored rectangular blocks separate different points.

Use case: Displaying core insights, key points, content chapters, etc.

### Data Page Template
Composition logic: Use geometric charts and infographic formats, such as simplified pie charts, bar charts, etc., all chart elements with clear black outlines. Colors use retro soft tones. Add decorative geometric elements to balance the image.

Use case: Displaying data, statistics, comparative analysis, summaries, etc.

## Usage Examples

### Generate Cover Page
```
{Base Prompt Template}

Generate a cover page. In the top 1/3 area, draw a horizontal panoramic vector illustration scene, including geometric simplified representations of: [choose scene elements based on theme].

Main title uses large retro serif font, content:
[Title Text]

Subtitle uses all-caps sans-serif within rectangular color block background:
[Subtitle Text]

Background uses cream/off-white paper texture.
```

### Generate Content Page
```
{Base Prompt Template}

Generate a content page. Draw horizontal illustration decorative band at the top.

Content area displays the following points, each point paired with a simple vector icon, all elements with uniform black outlines:

[Content Text]

Use colored rectangular blocks (coral red, mint green, mustard yellow) to separate different points.
```

### Generate Data Page
```
{Base Prompt Template}

Generate a data page. Use geometric vector chart format to display the following data, all chart elements with clear black outlines:

[Content Text]

Colors use retro soft tones, add decorative geometric elements (dots, stars, radiating lines) to balance the image.
```

## Technical Parameters

### Nano Banana Pro Configuration
- Model: gemini-3-pro-image-preview
- Aspect Ratio: 16:9
- Resolution: 2K (2752x1536) or 4K (5504x3072)
- Response Mode: IMAGE

### Recommended Settings
- Recommended Resolution: 2K (balance of quality and generation speed)
- Suitable for: Educational presentations, creative proposals, children's content, brand showcases, etc.
- Style characteristics: Warm and cute, easy to understand, retro and nostalgic

## Style Keywords

- Flat vector illustration
- Black outlines
- Geometric simplification
- Retro color palette
- Toy model aesthetic
- Horizontal panoramic composition
- Cream paper texture
- Decorative geometric elements
