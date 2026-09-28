currentUser={id:'preview'};
document.getElementById('auth-screen').hidden=true;
document.querySelector('.app').hidden=false;
appSettings.theme='light';applyTheme();
views.forEach(v=>document.getElementById('view-'+v).hidden=v!=='collection');
document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='collection'));
allSets=[{id:'1',set_num:'10316-1',name:'Le Seigneur des Anneaux — Fondcombe',year:2023,num_parts:6167,quantity:1,condition:'neuf',theme_name:'LEGO Icons',img_url:'favicon-square.svg',build_status:'boite'},{id:'2',set_num:'75367-1',name:'Le croiseur de la République',year:2023,num_parts:5374,quantity:1,condition:'occasion',theme_name:'Star Wars',img_url:'favicon-square.svg'},{id:'3',set_num:'10305-1',name:'Le château des chevaliers du Lion',year:2022,num_parts:4514,quantity:2,condition:'neuf',theme_name:'LEGO Icons',img_url:'favicon-square.svg'}];
populateThemeFilter();renderCollection();document.getElementById('collection-count').textContent='3 sets · Une collection qui prend forme';
setTimeout(()=>{const report=document.createElement('pre');report.id='ui-check';report.hidden=true;report.textContent=JSON.stringify({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,cards:document.querySelectorAll('.card').length,navLabels:document.querySelectorAll('.mobile-nav-btn span').length,cssLoaded:getComputedStyle(document.querySelector('.page-header h2')).letterSpacing});document.body.append(report)},100);
