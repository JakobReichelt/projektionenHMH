/**
 * Stage 6 Content Module
 * Manages the scrollable content overlay for final stage
 * AI-Friendly: Structured content definition with easy updates
 */

const StageContent = {
  // Content for different shows
  NIKI: {
    topImage: '/assets/NIKI/Rectangle4.png',
    title: 'Niki de Saint Phalle',
    intro: [
      'Farben, Kurven, Lebensfreude – und mittendrin Hannover. Kaum eine Künstlerin hat das Stadtbild so spielerisch geprägt wie Niki de Saint Phalle.',
      '„I have a very special feeling for Hannover." Dieses Gefühl ist bis heute spürbar. Besonders die berühmten Nanas am Leineufer sind längst mehr als Kunst: Sie gehören zur Stadt wie das Leben selbst.'
    ],
    sections: [
      {
        title: 'Nanas',
        image: '/assets/NIKI/nanas3.png',
        text: 'Die Nanas am Leineufer sind Nikis wohl bekanntestes Geschenk an Hannover. Als sie 1974 aufgestellt wurden, waren sie heftig umstritten – zu bunt, zu groß, zu provokant.<br><br>Heute sind sie unübersehbar und unverzichtbar. Sie stehen für Lebensfreude, Selbstbewusstsein und den Mut, Raum einzunehmen – genau das, wofür Niki de Saint Phalle lebte.'
      },
      {
        title: 'Sprengel',
        image: '/assets/NIKI/nanas2.png',
        text: 'Hannover und Niki de Saint Phalle verbindet auch das Sprengel Museum. Durch ihre Schenkungen wurde es zu einem der wichtigsten Orte für ihr Werk weltweit.<br><br>Ausstellungen wie „Love you for Infinity" zeigen bis heute, wie aktuell ihre Themen sind: Liebe, Freiheit, Körper und Politik – direkt, verspielt und kompromisslos.'
      },
      {
        title: 'Niki-Grotte',
        image: '/assets/NIKI/nanas1.png',
        text: 'Mitten in den Herrenhäuser Gärten öffnet sich eine kleine Fantasiewelt: die Niki-Grotte. Spiegel, Mosaike und Farben machen sie zu einem begehbaren Kunstwerk voller Überraschungen.<br><br>Sie zeigt, woran Niki glaubte: Kunst darf verzaubern, neugierig machen – und einfach Freude bereiten.',
        hasCircle: true
      },
      {
        title: 'Niki-<br>Promenade',
        image: '/assets/NIKI/nanas4.png',
        text: 'Auch im Alltag ist Niki in Hannover präsent. Die Niki-de-Saint-Phalle-Promenade am Kröpcke trägt ihren Namen – ganz selbstverständlich, mitten in der Stadt.<br><br>Viele gehen täglich darüber hinweg, ohne groß darüber nachzudenken. Und genau das passt perfekt zu Niki: Kunst, die da ist, lebt und begleitet.'
      }
    ],
    bottomImage: '/assets/NIKI/Rectangle1.png',
    logo: '/assets/NIKI/museum-logo.png',
    circleImage: '/assets/NIKI/ellipse.svg'
  },

  PFERDE: {
    topImage: '/assets/PFERDE/Rectangle4.png',
    title: 'Stadt und Ross',
    intro: [
      'Pferde gehören zu Hannovers Geschichte wie Straßen, Plätze und Parks. Sie waren Arbeitspartner, Statussymbol und Wirtschaftsfaktor – und haben die Stadt über Jahrhunderte mitgeformt.\n\nDiese Nähe ist bis heute spürbar. Ob im Stadtbild, im Sport oder ganz konkret auf den Straßen: Die Geschichte der Pferde prägt noch immer das heutige Erleben von Hannover.'
    ],
    sections: [
      {
        title: 'Hanno-<br>veraner',
        image: '/assets/PFERDE/pferde1.png',
        text: 'Der Hannoveraner ist eine der bekanntesten Pferderassen der Welt – und trägt den Namen der Stadt gleich mit. Ursprünglich als kräftiges Arbeitspferd gezüchtet, entwickelte er sich zu einem eleganten und leistungsstarken Sportpferd.\n\nBis heute steht der Hannoveraner für Qualität, Verlässlichkeit und internationale Klasse – und macht Hannover weltweit in Ställen und Turnieren sichtbar.'
      },
      {
        title: 'Symbolik',
        image: '/assets/PFERDE/pferde2.png',
        text: 'Das weiße Sachsenross im niedersächsischen Wappen ist eines der bekanntesten Pferdesymbole Deutschlands. Es steht für Stärke, Geschichte und regionale Identität – auch in Hannover.\n\nBis heute taucht das Pferd in Logos und Namen auf, etwa bei Continental oder dem Conti-Campus. Ein Zeichen dafür, wie selbstverständlich das Pferd Teil der visuellen Sprache der Stadt geblieben ist.'
      },
      {
        title: 'TiHo',
        image: '/assets/PFERDE/pferde3.png',
        text: 'Die Tierärztliche Hochschule Hannover wurde im 18. Jahrhundert gegründet, als Pferde für Militär, Landwirtschaft und Transport unverzichtbar waren. Ihre Gesundheit war ein zentrales öffentliches Interesse.\n\nDie Hochschule steht bis heute für diesen Ursprung: wissenschaftliches Wissen, das aus der engen Verbindung zwischen Stadt, Tier und Gesellschaft entstanden ist.',
        hasCircle: true
      },
      {
        title: 'Pferde-<br>Bilder',
        image: '/assets/PFERDE/pferde4.png',
        text: 'Pferde sind in Hannovers Kunstgeschichte fest verankert. Das Reiterstandbild von König Ernst August vor dem Hauptbahnhof ist seit über 150 Jahren Wahrzeichen, Treffpunkt und Symbol für Hannovers Vergangenheit als Residenzstadt.\n\nAuch am Leineufer taucht das Pferd in der Kunst auf: Die Skulptur „Mann und Pferd" zeigt die stille Nähe zwischen Mensch und Tier – reduziert, ruhig und eng mit der Geschichte der Stadt verbunden.'
      }
    ],
    bottomImage: '/assets/NIKI/Rectangle1.png',
    logo: '/assets/NIKI/museum-logo.png',
    circleImage: '/assets/NIKI/ellipse.svg'
  },

  LEIBNIZ: {
    topImage: '/assets/LEIBNIZ/Rectangle4.png',
    title: 'Leibniz<br>und<br>Bahlsen',
    intro: [
      'Hannover kann mehr als nur Messe und Maschsee – die Stadt ist auch Heimat einer echten Keks-Ikone.',
      'Hier entstand Ende des 19. Jahrhunderts die Firma Bahlsen, die mit dem Leibniz-Keks ein Produkt schuf, das bis heute in fast jedem Haushalt bekannt ist.',
      'Stadtgeschichte und Keksdose gehören in Hannover also enger zusammen, als man auf den ersten Blick denkt.'
    ],
    sections: [
      {
        title: 'Bahlsen',
        image: '/assets/LEIBNIZ/leibniz2.png',
        text: '1891 gründete Hermann Bahlsen in Hannover seine „Hannoversche Cakesfabrik". Das Unternehmen wuchs schnell und wurde zu einem wichtigen Arbeitgeber in der Stadt.<br><br>Bahlsen stand nicht nur für Kekse, sondern auch für moderne Arbeitsweisen, Werbung und Industriearchitektur.<br><br>Für viele Hannoveraner*innen war und ist Bahlsen ein fester Teil des Stadtbilds – und ein Stück lokaler Identität.'
      },
      {
        title: 'Leibniz-<br>Keks',
        image: '/assets/LEIBNIZ/leibniz3.png',
        text: '1898 brachte Bahlsen den Butterkeks auf den Markt und benannte ihn nach dem Universalgelehrten Gottfried Wilhelm Leibniz – einem der bekanntesten Söhne Hannovers.<br><br>Der Keks war ein Erfolg: einprägsame Form, gleichbleibende Qualität und frühe Markenwerbung machten ihn schnell bekannt.<br><br>Bis heute steht der Leibniz-Keks für Verlässlichkeit, Wiedererkennung und ein bisschen Nostalgie.'
      },
      {
        title: 'Keks-Klau',
        image: '/assets/LEIBNIZ/leibniz1.png',
        text: '2013 wurde ein übergroßer, vergoldeter Leibniz-Keks vom Bahlsen-Hauptsitz in Hannover gestohlen. Kurz darauf meldeten sich die Diebe mit einer ungewöhnlichen Forderung: Bahlsen sollte Kekse an soziale Einrichtungen spenden.<br><br>Das Unternehmen ging darauf ein – und der Keks-Krimi wurde zu einer charmanten PR-Geschichte mit Happy End. Später tauchte sogar das Krümelmonster in der Kommunikation auf und zeigte: In Hannover nimmt man selbst einen Keks-Diebstahl mit Humor.',
        hasCircle: true
      }
    ],
    bottomImage: '/assets/LEIBNIZ/Rectangle1.png',
    logo: '/assets/LEIBNIZ/museum-logo.png',
    circleImage: '/assets/LEIBNIZ/ellipse.svg'
  },

  /**
   * Load content for current show
   */
  load: function() {
    const showParam = window.CookieUtils.getShowParameter();
    const showKey = showParam ? showParam.toUpperCase() : 'NIKI';
    const content = this[showKey] || this.NIKI;
    
    const container = document.getElementById('stage6Content');
    if (!container) return;
    
    // Set data attribute
    container.setAttribute('data-show', showKey);
    
    // Build HTML
    let html = `
      <div class="top-portrait-section">
        <img src="${content.topImage}" alt="" class="top-portrait-img">
      </div>
      
      <h1 class="main-title">${content.title}</h1>
      
      <div class="intro-text">
        ${content.intro.map(p => `<p>${p}</p>`).join('\n        ')}
      </div>
    `;
    
    // Add sections
    const sectionClasses = ['nanas', 'sprengel', 'grotte', 'promenade'];
    content.sections.forEach((section, index) => {
      const sectionClass = sectionClasses[index] || 'section';
      
      html += `
      <h2 class="section-title">${section.title}</h2>
      <div class="${sectionClass}-image-section">
        <img src="${section.image}" alt="" class="section-img">
      </div>
      `;
      
      if (section.hasCircle) {
        html += `
      <div class="circle-button">
        <img src="${content.circleImage}" alt="" class="circle-svg">
      </div>
      `;
      }
      
      html += `<p class="section-text">${section.text}</p>`;
    });
    
    // Add bottom section
    html += `
      <div class="bottom-image-section">
        <img src="${content.bottomImage}" alt="" class="bottom-img">
      </div>
      <div class="bottom-white-bar"></div>
      
      <div class="museum-logo-section">
        <img src="${content.logo}" alt="" class="museum-logo">
      </div>
    `;
    
    container.innerHTML = html;
    window.VideoDiag.info('APP', `Stage 6 content loaded: ${showKey}`);
  },

  /**
   * Show stage 6 overlay
   */
  show: function() {
    this.load();
    const overlay = document.getElementById('stage6Overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      document.body.classList.add('stage6-open');
      overlay.scrollTop = 0;
      window.VideoDiag.info('APP', 'Stage 6 content visible');
    }
  },

  /**
   * Hide stage 6 overlay
   */
  hide: function() {
    const overlay = document.getElementById('stage6Overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
    document.body.classList.remove('stage6-open');
  }
};

window.StageContent = StageContent;
