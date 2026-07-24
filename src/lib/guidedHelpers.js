const packages = {
  'Sketch Study': { base: 80, timeline: '5–7 days' },
  'Fine Portrait': { base: 200, timeline: '10–14 days' },
  Masterwork: { base: 450, timeline: '3–5 weeks' },
};

export async function guidedSearch(query, artworks) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return artworks.map(artwork => artwork.id);
  return artworks
    .map(artwork => {
      const searchable = [artwork.title, artwork.category, artwork.description, artwork.medium, ...(Array.isArray(artwork.tags) ? artwork.tags : [])]
        .filter(Boolean).join(' ').toLowerCase();
      const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
      return { id: artwork.id, score };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(result => result.id);
}

export async function buildCommissionBrief(description) {
  const text = description.toLowerCase();
  const artworkType = text.includes('digital') ? 'Digital Art'
    : text.includes('charcoal') || text.includes('pencil') ? 'Pencil Drawing'
      : text.includes('sketch') ? 'Sketch'
        : text.includes('anime') ? 'Anime Art'
          : 'Portrait';
  const suggestedPackage = text.includes('large') || text.includes('detailed') || text.includes('master')
    ? 'Masterwork'
    : text.includes('quick') || text.includes('study') || text.includes('simple')
      ? 'Sketch Study'
      : 'Fine Portrait';
  const selected = packages[suggestedPackage];
  return {
    artworkType,
    suggestedPackage,
    estimatedPrice: suggestedPackage === 'Masterwork' ? '$450+' : `$${selected.base}`,
    estimatedTimeline: selected.timeline,
    moodTags: ['personal', 'considered', 'handcrafted'],
    clarifyingQuestions: [
      'What size should the finished artwork be?',
      'Which details or mood matter most to you?',
      'Do you have a delivery deadline?',
    ],
    visionSummary: `A ${artworkType.toLowerCase()} commission shaped around your subject, preferred mood, size, and deadline.`,
  };
}

export async function calculateGuidePrice({ artworkType, complexity = 3, numSubjects = 1, packageName }) {
  const selectedName = packageName || (artworkType === 'Sketch' ? 'Sketch Study' : 'Fine Portrait');
  const selected = packages[selectedName] || packages['Fine Portrait'];
  const complexityFactor = 1 + Math.max(0, Number(complexity) - 3) * 0.15;
  const subjectFactor = 1 + Math.max(0, Number(numSubjects) - 1) * 0.25;
  const suggestedPrice = Math.round(selected.base * complexityFactor * subjectFactor);
  const high = Math.round(suggestedPrice * 1.2);
  return {
    suggestedPrice,
    priceRange: `$${suggestedPrice}–$${high}`,
    rationale: 'This planning estimate uses the selected package, complexity, and number of subjects. The artist confirms the final quote after reviewing your brief.',
    deposit: Math.round(suggestedPrice / 2),
  };
}

export function guidedReply(message) {
  const text = message.toLowerCase();
  if (text.includes('price') || text.includes('cost') || text.includes('budget')) {
    return 'Planning prices begin at $80 for a sketch study, $200 for a fine portrait, and $450 for a masterwork. Your final quote is confirmed by the artist.';
  }
  if (text.includes('time') || text.includes('deadline')) {
    return 'Typical delivery is 5–7 days for studies, 10–14 days for portraits, and 3–5 weeks for masterworks. Add your deadline to the commission form.';
  }
  if (text.includes('size') || text.includes('dimension')) {
    return 'Include the preferred paper or canvas size in your brief. Larger work usually needs more production time and may change the final quote.';
  }
  return 'A useful brief includes the subject, style, size, mood, important colors, reference images, budget, and deadline.';
}
