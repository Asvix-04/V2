from typing import List, Dict
import re

class QueryExpander:
    """
    Expanded query system for IGNOU Media Literacy syllabus.
    
    FIXES from Digilab evaluation:
    - "Retrieval is too literal" → Comprehensive concept aliasing
    - "Semantic adjacency is underused" → Fuzzy keyword extraction
    - "time-shift journalism retrieval failed due to wording mismatch"
      → Deep alias mappings matching how IGNOU PDFs actually phrase things
    - Expanded from 4 to 6 query variations for better recall
    """
    
    def __init__(self):
        # COMPREHENSIVE concept mappings aligned with IGNOU MJM-023 syllabus
        # Each key maps to how the concept ACTUALLY appears in the course PDFs
        self.concept_mappings = {
            # --- Research Methodology ---
            'life cycle': ['research life cycle', 'research process', 'methodology steps', 'research phases', 'stages of research'],
            'digital survey': ['online survey', 'web survey', 'internet survey', 'digital questionnaire', 'web-based survey'],
            'sampling': ['sample selection', 'participant recruitment', 'sampling methods', 'sample design', 'probability sampling', 'non-probability sampling'],
            'data analysis': ['data interpretation', 'statistical analysis', 'findings analysis', 'data processing', 'qualitative analysis', 'quantitative analysis'],
            'digital divide': ['access gap', 'digital inequality', 'coverage error', 'access limitations', 'internet access gap'],
            'methodology': ['research method', 'approach', 'technique', 'research design', 'mixed methods'],
            'ethnography': ['digital ethnography', 'online ethnography', 'netnography', 'virtual ethnography', 'participant observation online'],
            'experiment': ['online experiment', 'digital experiment', 'web experiment', 'experimental design', 'controlled experiment'],
            
            # --- Journalism & Media ---
            'time-shift journalism': ['asynchronous news', 'non-linear news consumption', 'archived news access', 'on-demand news', 'time shifting', 'delayed viewing'],
            'time shift': ['asynchronous news', 'non-linear news consumption', 'archived news', 'on-demand news', 'time shifting', 'delayed viewing'],
            'online journalism': ['digital journalism', 'web journalism', 'internet journalism', 'cyber journalism', 'multimedia journalism'],
            'citizen journalism': ['participatory journalism', 'user-generated content', 'crowd-sourced news', 'grassroots journalism', 'public journalism'],
            'convergence': ['media convergence', 'digital convergence', 'technological convergence', 'newsroom convergence', 'multimedia integration'],
            'fake news': ['misinformation', 'disinformation', 'false information', 'media manipulation', 'information disorder'],
            'media literacy': ['media education', 'critical media analysis', 'media awareness', 'information literacy', 'digital literacy'],
            'media ethics': ['journalism ethics', 'ethical reporting', 'code of conduct', 'press ethics', 'media accountability'],
            
            # --- Radio & Broadcasting ---
            'radio': ['radio broadcasting', 'radio journalism', 'radio production', 'broadcast radio', 'community radio', 'radio technology'],
            'radio news': ['radio bulletin', 'news bulletin', 'radio newscast', 'broadcast news', 'news reading', 'news presentation'],
            'broadcasting': ['broadcast media', 'radio broadcasting', 'television broadcasting', 'transmission', 'broadcast journalism'],
            'community radio': ['local radio', 'community broadcasting', 'participatory radio', 'grassroots radio'],
            
            # --- Television & Video ---
            'television': ['TV', 'television broadcasting', 'television journalism', 'TV production', 'video production'],
            'documentary': ['documentary film', 'documentary production', 'non-fiction film', 'factual programming'],
            'video production': ['video editing', 'videography', 'camera work', 'visual storytelling'],
            
            # --- Digital Media ---
            'social media': ['social networking', 'social platforms', 'digital platforms', 'user-generated media'],
            'blog': ['blogging', 'web log', 'online writing', 'digital publishing', 'content creation'],
            'podcast': ['podcasting', 'audio content', 'digital audio', 'internet radio'],
            'multimedia': ['rich media', 'interactive media', 'digital content', 'mixed media'],
            'interactivity': ['interactive media', 'user interaction', 'audience participation', 'two-way communication'],
            'hypertext': ['hyperlink', 'web links', 'non-linear text', 'hypertextuality'],
            
            # --- News & Reporting ---
            'news writing': ['news reporting', 'journalistic writing', 'inverted pyramid', 'lead writing', 'headline writing'],
            'news values': ['newsworthiness', 'news criteria', 'news judgment', 'news selection', 'gatekeeping'],
            'editing': ['news editing', 'copy editing', 'sub-editing', 'editorial process'],
            'interview': ['interviewing technique', 'journalistic interview', 'questioning technique'],
            
            # --- Photography ---
            'photography': ['digital photography', 'photojournalism', 'camera techniques', 'image composition'],
            'camera': ['camera operation', 'camera types', 'DSLR', 'SLR', 'digital camera'],
            
            # --- Advertising & PR ---
            'advertising': ['advertisement', 'ad campaign', 'media advertising', 'digital advertising'],
            'public relations': ['PR', 'media relations', 'corporate communication', 'press release'],
            
            # --- Print Media ---
            'newspaper': ['print journalism', 'press', 'daily newspaper', 'print media'],
            'magazine': ['periodical', 'print magazine', 'feature writing'],
            'print media': ['newspapers', 'magazines', 'print journalism', 'publishing'],
            
            # --- Communication Theory ---
            'communication': ['mass communication', 'media communication', 'communication theory', 'communication models'],
            'audience': ['media audience', 'target audience', 'readership', 'viewership', 'audience research'],
            'gatekeeping': ['editorial gatekeeping', 'news selection', 'information filtering'],
            'agenda setting': ['media agenda', 'public agenda', 'framing', 'priming'],
            
            # --- Generic academic patterns (match IGNOU question styles) ---
            'challenges': ['problems', 'issues', 'limitations', 'obstacles', 'difficulties', 'concerns', 'drawbacks'],
            'advantages': ['benefits', 'merits', 'strengths', 'positive aspects', 'features'],
            'disadvantages': ['drawbacks', 'limitations', 'weaknesses', 'negative aspects', 'demerits'],
            'characteristics': ['features', 'attributes', 'properties', 'qualities', 'aspects'],
            'types': ['kinds', 'categories', 'forms', 'varieties', 'classifications'],
            'role': ['function', 'purpose', 'importance', 'significance', 'contribution'],
            'impact': ['effect', 'influence', 'consequence', 'result', 'implications'],
        }
        
        # Question pattern recognition
        self.question_patterns = {
            'definition': r'what is|what are|define|definition of|meaning of',
            'process': r'how to|how do|steps|process|lifecycle|phases|procedure|stages',
            'comparison': r'difference between|compare|versus|vs|differentiate|distinguish|contrast',
            'explanation': r'explain|why|how does|elaborate|discuss|describe',
            'list': r'list|enumerate|what are the|name the|mention the|state the',
            'role': r'role of|importance of|significance of|function of',
            'advantages': r'advantages|benefits|merits|pros',
            'challenges': r'challenges|problems|issues|limitations|disadvantages|drawbacks|cons',
        }
    
    def expand_query(self, query: str) -> List[str]:
        """Expand query with focused variations — up to 6 for better recall."""
        query_lower = query.lower().strip()
        expanded = [query_lower]
        
        query_type = self._detect_query_type(query_lower)
        key_concepts = self._extract_key_concepts(query_lower)
        
        if query_type == 'process':
            for concept in key_concepts:
                if concept in self.concept_mappings:
                    for variant in self.concept_mappings[concept][:2]:
                        expanded.append(f"steps in {variant}")
                        expanded.append(f"{variant} process")
        
        elif query_type == 'definition':
            for concept in key_concepts:
                if concept in self.concept_mappings:
                    for variant in self.concept_mappings[concept][:2]:
                        expanded.append(variant)
                        expanded.append(f"{variant} definition meaning")
        
        elif query_type == 'comparison':
            for concept in key_concepts:
                if concept in self.concept_mappings:
                    for variant in self.concept_mappings[concept][:2]:
                        expanded.append(variant)
                        new_query = query_lower.replace(concept, variant)
                        if new_query != query_lower:
                            expanded.append(new_query)
        
        elif query_type in ('challenges', 'advantages'):
            for concept in key_concepts:
                if concept in self.concept_mappings:
                    for variant in self.concept_mappings[concept][:2]:
                        expanded.append(f"{variant} {query_type}")
                        new_query = query_lower.replace(concept, variant)
                        if new_query != query_lower:
                            expanded.append(new_query)
        
        elif query_type == 'role':
            for concept in key_concepts:
                if concept in self.concept_mappings:
                    for variant in self.concept_mappings[concept][:2]:
                        expanded.append(f"role of {variant}")
                        expanded.append(f"importance of {variant}")
        
        else:
            for concept in key_concepts:
                if concept in self.concept_mappings:
                    for variant in self.concept_mappings[concept][:3]:
                        new_query = query_lower.replace(concept, variant)
                        if new_query != query_lower:
                            expanded.append(new_query)
                        else:
                            expanded.append(variant)
        
        # Deduplicate preserving order
        seen = set()
        unique_expanded = []
        for q in expanded:
            if q not in seen:
                seen.add(q)
                unique_expanded.append(q)
        
        return unique_expanded[:6]
    
    def _detect_query_type(self, query: str) -> str:
        for qtype, pattern in self.question_patterns.items():
            if re.search(pattern, query, re.IGNORECASE):
                return qtype
        return 'general'
    
    def _extract_key_concepts(self, query: str) -> List[str]:
        """Extract key concepts using exact match, single-word match, AND reverse alias lookup."""
        stopwords = {'what', 'is', 'the', 'a', 'an', 'and', 'or', 'but', 
                    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
                    'how', 'does', 'do', 'are', 'explain', 'describe',
                    'discuss', 'elaborate', 'define', 'list', 'mention',
                    'state', 'name', 'between', 'difference', 'compare',
                    'differentiate', 'role', 'importance', 'significance'}
        
        query_lower = query.lower()
        found_concepts = []
        
        # PASS 1: Multi-word exact match
        for concept in self.concept_mappings.keys():
            if concept in query_lower:
                found_concepts.append(concept)
        
        # PASS 2: Single-word key match
        words = query_lower.split()
        for word in words:
            if word not in stopwords and len(word) > 3:
                if word in self.concept_mappings:
                    found_concepts.append(word)
        
        # PASS 3: Reverse alias lookup — if the query uses a term that is
        # an ALIAS (value) in any mapping, pull the parent concept.
        # This catches "netnography" → ethnography, "inverted pyramid" → news writing, etc.
        if not found_concepts:
            meaningful_words = [w for w in words if w not in stopwords and len(w) > 3]
            for word in meaningful_words:
                for concept, aliases in self.concept_mappings.items():
                    for alias in aliases:
                        if word in alias.lower().split():
                            found_concepts.append(concept)
                            break
                    if found_concepts:
                        break
        
        return list(dict.fromkeys(found_concepts))
