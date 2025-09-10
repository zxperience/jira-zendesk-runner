
export function formatJiraCommentToHtml(comment: any): string {
  if (!comment || !comment.body || comment.body.type !== 'doc') return '';

  const authorName = comment.author?.displayName ?? 'Desconhecido';
  const createdDate = new Date('2025-07-31T15:58:09.199-0300').toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });

  const bodyHtml = renderAdfToHtml(comment.body);

  return `
        <div style="margin-bottom: 1em;">
            <i>[Comentário adicionado a partir do Jira. ID: ${comment.id}]</i><br>
            <strong>Por:</strong>
            <strong>${authorName}</strong> <small>(${createdDate})</small>
            <div style="margin-top: 0.5em;">${bodyHtml}</div>
        </div>
    `;
}

function renderAdfToHtml(adf: any): string {
  if (!adf || adf.type !== 'doc' || !Array.isArray(adf.content)) return '';

  return adf.content.map(renderAdfNode).join('');
}

function renderAdfNode(node: any): string {
  if (!node) return '';

  switch (node.type) {
    case 'paragraph':
      return `<p>${(node.content || []).map(renderAdfNode).join('')}</p>`;

    case 'text':
      let text = escapeHtml(node.text || '');
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'strong') text = `<strong>${text}</strong>`;
          if (mark.type === 'em') text = `<em>${text}</em>`;
          if (mark.type === 'underline') text = `<u>${text}</u>`;
          if (mark.type === 'code') text = `<code>${text}</code>`;
          if (mark.type === 'link') {
            const href = mark.attrs?.href ?? '#';
            text = `<a href="${escapeHtml(href)}" target="_blank">${text}</a>`;
          }
        }
      }
      return text;

    case 'inlineCard': {
      const url = node.attrs?.url ?? '#';
      const issueKey = url.split('/').pop() ?? url;
      return `
        <span style="display:inline-block; padding:2px 6px; border:1px solid #ddd; border-radius:4px; background:#f9f9f9;">
          <a href="${escapeHtml(url)}" target="_blank" style="text-decoration:none; color:#0366d6;">
            ${escapeHtml(issueKey)}
          </a>
        </span>
      `;
    }
    case 'hardBreak':
      return '<br>';

    case 'bulletList':
      return `<ul>${(node.content || []).map(renderAdfNode).join('')}</ul>`;

    case 'orderedList':
      return `<ol>${(node.content || []).map(renderAdfNode).join('')}</ol>`;

    case 'listItem':
      return `<li>${(node.content || []).map(renderAdfNode).join('')}</li>`;

    case 'heading':
      const level = node.attrs?.level ?? 1;
      return `<h${level}>${(node.content || []).map(renderAdfNode).join('')}</h${level}>`;

    default:
      // Se o tipo não for tratado, renderiza o conteúdo interno, se houver.
      return (node.content || []).map(renderAdfNode).join('');
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getIssueSubdomain(issue: any): string {
  return issue?.self?.split('/')[2] ?? 'N/A';
}
