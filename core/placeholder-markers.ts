import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { Extension, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { EditorSelection } from "@codemirror/state";

// Marker pattern: <[word_characters]>
const MARKER_REGEX = /<\[(\w+)\]>/g;

class PlaceholderMarkerWidget extends WidgetType {
  constructor(readonly content: string, readonly from: number, readonly to: number, readonly view: EditorView) {
    super();
  }

  eq(other: PlaceholderMarkerWidget) {
    return other.content === this.content && other.from === this.from && other.to === this.to;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "placeholder-marker";
    // Convert underscores to spaces for visual display
    span.textContent = this.content.replace(/_/g, ' ');
    
    // Store position data on the element for event handler
    span.dataset.from = this.from.toString();
    span.dataset.to = this.to.toString();
    
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

function getMarkerDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const selection = view.state.selection;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;
    
    // Skip if line is inside a code block or code fence
    if (isInsideCodeBlock(view, line.from)) {
      continue;
    }

    let match;
    MARKER_REGEX.lastIndex = 0;
    
    while ((match = MARKER_REGEX.exec(lineText)) !== null) {
      const startPos = line.from + match.index;
      const endPos = startPos + match[0].length;
      
      // Check if cursor/selection intersects with this marker
      let cursorIntersects = false;
      for (const range of selection.ranges) {
        if (range.from <= endPos && range.to >= startPos) {
          cursorIntersects = true;
          break;
        }
      }

      // Only add decoration if cursor is NOT intersecting
      if (!cursorIntersects) {
        // Hide the delimiters and show styled content
        const markerContent = match[1];
        
        // Add decoration to hide the entire marker and replace with styled content
        builder.add(
          startPos,
          endPos,
          Decoration.replace({
            widget: new PlaceholderMarkerWidget(markerContent, startPos, endPos, view)
          })
        );
      }
    }
  }

  return builder.finish();
}

function isInsideCodeBlock(view: EditorView, pos: number): boolean {
  const tree = syntaxTree(view.state);
  const node = tree.resolveInner(pos);
  
  // Check if we're inside various code block types
  let current = node;
  while (current) {
    const type = current.type.name;
    if (type.includes("CodeBlock") || 
        type.includes("FencedCode") || 
        type.includes("InlineCode") ||
        type === "CodeText" ||
        type === "CodeMark") {
      return true;
    }
    current = current.parent;
  }
  
  // Additional check for triple backtick code blocks
  const lineText = view.state.doc.lineAt(pos).text;
  
  // Simple heuristic: if we're on a line that starts with ```, it's likely a code fence
  if (lineText.trim().startsWith('```')) {
    return true;
  }
  
  return false;
}

const placeholderMarkerPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = getMarkerDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = getMarkerDecorations(update.view);
      }
    }
  },
  {
    decorations: v => v.decorations,
    eventHandlers: {
      mousedown: (event, view) => {
        // Check if the click is on a marker widget
        const target = event.target as HTMLElement;
        if (target.classList.contains('placeholder-marker')) {
          event.preventDefault();
          event.stopPropagation();
          
          // Get position data from the element
          const from = parseInt(target.dataset.from || '0');
          const to = parseInt(target.dataset.to || '0');
          
          if (from !== 0 && to !== 0) {
            // Select the entire marker including delimiters
            view.dispatch({
              selection: EditorSelection.single(from, to),
              scrollIntoView: true
            });
            
            // Focus the editor
            view.focus();
          }
          
          return true; // Event handled
        }
        return false;
      }
    }
  }
);

export interface MarkerPosition {
  from: number;
  to: number;
  content: string;
  fullText: string;
}

export function findAllMarkers(view: EditorView): MarkerPosition[] {
  const markers: MarkerPosition[] = [];
  const doc = view.state.doc;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;
    
    // Skip if line is inside a code block
    if (isInsideCodeBlock(view, line.from)) {
      continue;
    }

    let match;
    MARKER_REGEX.lastIndex = 0;
    
    while ((match = MARKER_REGEX.exec(lineText)) !== null) {
      const startPos = line.from + match.index;
      const endPos = startPos + match[0].length;
      
      // Check for nesting - only include innermost markers
      const beforeMarker = lineText.substring(0, match.index);
      
      // Count how many unclosed <[ appear before this position
      let openCount = 0;
      let pos = 0;
      while (pos < beforeMarker.length) {
        const openIndex = beforeMarker.indexOf('<[', pos);
        const closeIndex = beforeMarker.indexOf(']>', pos);
        
        if (openIndex === -1) break;
        
        if (closeIndex === -1 || openIndex < closeIndex) {
          // Found an opening <[ before any closing ]>
          openCount++;
          pos = openIndex + 2;
        } else {
          // Found a closing ]> first, reduces open count
          if (openCount > 0) openCount--;
          pos = closeIndex + 2;
        }
      }
      
      // Only include if this is the innermost marker (no unclosed <[ before it)
      if (openCount === 0) {
        markers.push({
          from: startPos,
          to: endPos,
          content: match[1],
          fullText: match[0]
        });
      }
    }
  }

  return markers.sort((a, b) => a.from - b.from);
}

export function navigateToMarker(view: EditorView, direction: 'next' | 'prev'): boolean {
  const markers = findAllMarkers(view);
  if (markers.length === 0) return false;

  const currentSelection = view.state.selection.main;
  let targetIndex = -1;

  if (direction === 'next') {
    // Find first marker after current position
    targetIndex = markers.findIndex(marker => marker.from > currentSelection.to);
    // If none found, wrap to first marker
    if (targetIndex === -1) {
      targetIndex = 0;
    }
  } else {
    // Find last marker before current position
    for (let i = markers.length - 1; i >= 0; i--) {
      if (markers[i].to < currentSelection.from) {
        targetIndex = i;
        break;
      }
    }
    // If none found, wrap to last marker
    if (targetIndex === -1) {
      targetIndex = markers.length - 1;
    }
  }

  const targetMarker = markers[targetIndex];
  if (targetMarker) {
    // Select the entire marker including delimiters
    view.dispatch({
      selection: EditorSelection.single(targetMarker.from, targetMarker.to),
      scrollIntoView: true
    });
    return true;
  }

  return false;
}

export const placeholderMarkerExtension: Extension = [
  placeholderMarkerPlugin
];