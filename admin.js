const API_URL = '/api/admin';
let authToken = localStorage.getItem('adminToken');

// Check Initial Auth
if (authToken) {
    showDashboard();
}

async function login() {
    const pass = document.getElementById('adminPass').value;
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass })
        });
        const data = await res.json();

        if (data.success) {
            authToken = data.token; // In a real app, use JWT
            localStorage.setItem('adminToken', authToken);
            showDashboard();
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    } catch (e) {
        console.error(e);
        alert('Error conectando con el servidor');
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    location.reload();
}

function showDashboard() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    fetchStats();
    fetchPlayers();
}

async function fetchStats() {
    try {
        const res = await fetch(`${API_URL}/stats`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const stats = await res.json();

        document.getElementById('totalCount').textContent = stats.total || 0;

        if (stats.byTeam) {
            document.getElementById('teamCount').textContent = stats.byTeam.length;
        }

        if (stats.byCategory && stats.byCategory.length > 0) {
            // Find max
            const top = stats.byCategory.reduce((prev, current) => (prev.count > current.count) ? prev : current);
            document.getElementById('topCategory').textContent = top.category.toUpperCase();
        }

    } catch (e) {
        console.error('Error stats:', e);
    }
}

// Global players data for client-side filtering
let allPlayers = [];

async function fetchPlayers() {
    try {
        const res = await fetch(`${API_URL}/players`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        allPlayers = await res.json();
        renderTable();
    } catch (e) {
        console.error('Error players:', e);
    }
}

function renderTable() {
    const tbody = document.getElementById('playersTableBody');
    tbody.innerHTML = '';

    const textFilter = document.getElementById('searchInput').value.toLowerCase();
    const catFilter = document.getElementById('filterCategory').value.toLowerCase();
    const teamFilter = document.getElementById('filterTeam').value.toLowerCase();

    // Filtros combinados
    const filtered = allPlayers.filter(p => {
        const matchesText = `${p.fullName} ${p.dni} ${p.teamName}`.toLowerCase().includes(textFilter);
        const matchesCat = catFilter ? p.category.toLowerCase() === catFilter : true;
        const matchesTeam = teamFilter ? p.teamName.toLowerCase() === teamFilter : true;

        return matchesText && matchesCat && matchesTeam;
    });

    filtered.forEach(p => {
        const tr = document.createElement('tr');
        const date = new Date(p.createdAt).toLocaleDateString();
        const teamFormatted = p.teamName.replace(/_/g, ' ').toUpperCase();

        const photoHtml = p.dniPlayerPath
            ? `<img src="${p.dniPlayerPath}" style="width:40px; height:40px; object-fit:cover; border-radius:5px; cursor:pointer;" onclick="window.open('${p.dniPlayerPath}', '_blank')">`
            : `<div style="width:40px; height:40px; background:#334155; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8;">X</div>`;

        tr.innerHTML = `
            <td style="color: #64748b; font-size: 0.9em;">${date}</td>
            <td>${photoHtml}</td>
            <td style="font-weight: 600;">${p.fullName}</td>
            <td>${p.dni}</td>
            <td><span class="badge badge-team">${teamFormatted}</span></td>
            <td><span class="badge badge-cat">${p.category.toUpperCase()}</span></td>
            <td>${p.playerType.toUpperCase()}</td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button class="badge" style="background:var(--primary); color:white; border:none; cursor:pointer;" onclick='openModal(${JSON.stringify(p)})'>
                        👁️ Ver
                    </button>
                    <button class="badge" style="background:#ef4444; color:white; border:none; cursor:pointer;" onclick='deletePlayer(${p.id})'>
                        🗑️
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// === MODAL FUNCTIONS ===
function openModal(player) {
    const modal = document.getElementById('detailsModal');
    const body = document.getElementById('modalBody');

    // Prepare socio info if exists
    let socioInfo = '';
    if (player.playerType !== 'socio') {
        socioInfo = `
            <div style="margin-top:20px; border-top: 1px solid #334155; padding-top:15px;">
                <h3 style="color:var(--primary); margin-bottom:10px;">Autorización de Socio</h3>
                <p><span class="modal-label">Socio:</span> ${player.socioName || '-'}</p>
                <p><span class="modal-label">C.I. Socio:</span> ${player.socioDni || '-'}</p>
                <p><span class="modal-label">Tel. Socio:</span> ${player.socioPhone || '-'}</p>
                ${player.dniSocioPath ? `
                    <div class="dni-preview">
                        <span>Cédula del Socio:</span>
                        <img src="${player.dniSocioPath}" alt="CI Socio" onclick="window.open('${player.dniSocioPath}', '_blank')">
                    </div>
                ` : ''}
            </div>
        `;
    }

    body.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <p><span class="modal-label">Nombre:</span> ${player.fullName}</p>
                <p><span class="modal-label">C.I.:</span> ${player.dni}</p>
                <p><span class="modal-label">Teléfono:</span> ${player.phone}</p>
                <p><span class="modal-label">Email:</span> ${player.email}</p>
                <p><span class="modal-label">Camiseta:</span> #${player.jerseyNumber || 'N/A'}</p>
                <p><span class="modal-label">Equipo:</span> ${player.teamName.replace(/_/g, ' ').toUpperCase()}</p>
                <p><span class="modal-label">Categoría:</span> ${player.category.toUpperCase()}</p>
                <p><span class="modal-label">Tipo:</span> ${player.playerType.toUpperCase()}</p>
                <p><span class="modal-label">Registro:</span> ${new Date(player.createdAt).toLocaleString()}</p>
            </div>
            <div class="dni-preview">
                <span>Cédula del Jugador:</span>
                ${player.dniPlayerPath ? `
                    <img src="${player.dniPlayerPath}" alt="CI Jugador" onclick="window.open('${player.dniPlayerPath}', '_blank')">
                ` : '<p style="color:#64748b; font-style:italic;">No hay foto disponible</p>'}
            </div>
        </div>
        ${socioInfo}
    `;

    modal.style.display = 'flex';
}

function closeModal() {
    document.getElementById('detailsModal').style.display = 'none';
}

// Close modal on outside click
window.onclick = function (event) {
    const modal = document.getElementById('detailsModal');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

function exportToExcel() {
    if (allPlayers.length === 0) {
        alert("No hay datos para exportar");
        return;
    }

    const wb = XLSX.utils.book_new();

    // Filtramos según la vista actual
    const textFilter = document.getElementById('searchInput').value.toLowerCase();
    const catFilter = document.getElementById('filterCategory').value.toLowerCase();
    const teamFilter = document.getElementById('filterTeam').value.toLowerCase();

    const filtered = allPlayers.filter(p => {
        const matchesText = `${p.fullName} ${p.dni} ${p.teamName}`.toLowerCase().includes(textFilter);
        const matchesCat = catFilter ? p.category.toLowerCase() === catFilter : true;
        const matchesTeam = teamFilter ? p.teamName.toLowerCase() === teamFilter : true;
        return matchesText && matchesCat && matchesTeam;
    });

    if (filtered.length === 0) {
        alert("La lista actual está vacía");
        return;
    }

    // Agrupar por Categoría (Hojas diferentes)
    const categories = [...new Set(filtered.map(p => p.category))];

    categories.forEach(cat => {
        const catPlayers = filtered.filter(p => p.category === cat)
            .sort((a, b) => a.teamName.localeCompare(b.teamName)); // Ordenar por equipo

        const data = catPlayers.map(p => ({
            "FECHA": new Date(p.createdAt).toLocaleDateString(),
            "EQUIPO": p.teamName.replace(/_/g, ' ').toUpperCase(),
            "NOMBRE COMPLETO": p.fullName.toUpperCase(),
            "CÉDULA": p.dni,
            "TELÉFONO": p.phone,
            "EMAIL": p.email,
            "CAMISETA": p.jerseyNumber || 'N/A',
            "TIPO": p.playerType.toUpperCase(),
            "SOCIO GARANTE": p.socioName || 'N/A',
            "CI SOCIO": p.socioDni || 'N/A'
        }));

        const ws = XLSX.utils.json_to_sheet(data);

        // Ajustar ancho de columnas básico
        const wscols = [
            { wch: 12 }, { wch: 25 }, { wch: 35 }, { wch: 15 }, { wch: 15 },
            { wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 15 }
        ];
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, cat.toUpperCase());
    });

    XLSX.writeFile(wb, `LISTA_BUENA_FE_AFEMEC_${new Date().getFullYear()}.xlsx`);
}

// Listeners
document.getElementById('searchInput').addEventListener('input', renderTable);
document.getElementById('filterCategory').addEventListener('change', renderTable);
document.getElementById('filterTeam').addEventListener('change', renderTable);

// --- IMPORTAR EXCEL ---
document.getElementById('importExcel').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Asumimos que la primera hoja tiene los datos
            const firstSheet = workbook.SheetNames[0];
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

            if (jsonData.length === 0) {
                alert("El archivo está vacío");
                return;
            }

            // Mapear campos (ajustar nombres según el Excel esperado)
            const playersToImport = jsonData.map(row => ({
                fullName: row["NOMBRE COMPLETO"] || row["NAME"] || row["fullName"],
                dni: row["CÉDULA"] || row["DNI"] || row["dni"],
                phone: row["TELÉFONO"] || row["PHONE"] || row["phone"] || "",
                email: row["EMAIL"] || row["email"] || "",
                teamName: row["EQUIPO"] || row["TEAM"] || row["teamName"],
                category: (row["CATEGORÍA"] || row["CATEGORY"] || row["category"] || "").toLowerCase(),
                playerType: (row["TIPO"] || row["TYPE"] || row["playerType"] || "socio").toLowerCase(),
                jerseyNumber: row["CAMISETA"] || row["NUMBER"] || row["jerseyNumber"] || ""
            }));

            if (!confirm(`¿Deseas importar ${playersToImport.length} jugadores?`)) return;

            const res = await fetch(`${API_URL}/players/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ players: playersToImport })
            });

            const result = await res.json();
            if (result.success) {
                alert(result.message);
                fetchPlayers(); // Recargar tabla
            } else {
                alert("Error al importar: " + result.message);
            }
        } catch (err) {
            console.error(err);
            alert("Error procesando el archivo Excel");
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; // Reset
});

async function deletePlayer(id) {
    if (!confirm('¿Estás seguro de que quieres eliminar a este jugador? Esta acción no se puede deshacer.')) return;

    try {
        const res = await fetch(`${API_URL}/players/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
            // Actualizar lista local y re-renderizar
            allPlayers = allPlayers.filter(p => p.id != id);
            renderTable();
            // Actualizar stats también
            fetchStats();
        } else {
            alert('Error eliminando: ' + (data.error || 'Desconocido'));
        }
    } catch (e) {
        console.error(e);
        alert('Error conectando con servidor');
    }
}
