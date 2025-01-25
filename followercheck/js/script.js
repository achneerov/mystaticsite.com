function handleFileUpload(side) {
    const fileInput = document.getElementById(side + 'Upload');
    const fileLabel = document.getElementById(side + 'UploadLabel');
    const fileConfirmation = document.getElementById(side + 'FileConfirmation');
    const compareButton = document.getElementById('compareButton');

    if (fileInput.files.length > 0) {
        const fileName = fileInput.files[0].name;
        fileLabel.classList.add('bg-blue-100', 'border-blue-300');
        fileConfirmation.textContent = `"${fileName}" uploaded successfully!`;
        fileConfirmation.classList.remove('hidden');
    } else {
        fileConfirmation.classList.add('hidden');
    }

    const leftFileUploaded = document.getElementById('leftUpload').files.length > 0;
    const rightFileUploaded = document.getElementById('rightUpload').files.length > 0;

    if (leftFileUploaded && rightFileUploaded) {
        compareButton.classList.remove('bg-gray-500', 'cursor-not-allowed', 'hover:bg-gray-600');
        compareButton.classList.add('bg-green-500', 'hover:bg-green-600');
        compareButton.disabled = false;
    } else {
        compareButton.classList.remove('bg-green-500', 'hover:bg-green-600');
        compareButton.classList.add('bg-gray-500', 'cursor-not-allowed');
        compareButton.disabled = true;
    }
}

function compareFiles() {
    const leftFileInput = document.getElementById("leftUpload");
    const rightFileInput = document.getElementById("rightUpload");
    const resultDiv = document.getElementById("who_doesnt_follow_back");

    if (leftFileInput.files.length === 0 || rightFileInput.files.length === 0) {
        alert("Please select two JSON files for comparison.");
        return;
    }

    const leftFile = leftFileInput.files[0];
    const rightFile = rightFileInput.files[0];

    const reader = new FileReader();

    reader.onload = function(e) {
        const leftData = JSON.parse(e.target.result);
        const followerList = leftData.map(item => item.string_list_data[0].value);

        const rightReader = new FileReader();
        rightReader.onload = function(e) {
            const rightData = JSON.parse(e.target.result);
            const followingList = rightData.relationships_following.map(item => item.string_list_data[0].value);
            const followingButNotFollowingBackList = followingList.filter(value => !followerList.includes(value));

            const numberWidth = followingButNotFollowingBackList.length.toString().length;
            
            const maxNameLength = Math.max(...followingButNotFollowingBackList.map(name => name.length));
            const nameWidth = Math.min(maxNameLength + 2, 30);

            const table = document.createElement("table");
            table.classList.add('mx-auto', 'text-left', 'border-collapse');

            const headerRow = table.insertRow(0);

            const headerCell1 = headerRow.insertCell(0);
            headerCell1.innerHTML = "#";
            headerCell1.classList.add('px-2', 'py-2', 'bg-blue-500', 'text-white', 'font-semibold', 'text-center');
            headerCell1.style.width = `${numberWidth + 2}ch`;

            const headerCell2 = headerRow.insertCell(1);
            headerCell2.innerHTML = "Username";
            headerCell2.classList.add('px-2', 'py-2', 'bg-blue-500', 'text-white', 'font-semibold', 'text-center');
            headerCell2.style.width = `${nameWidth}ch`;

            for (let i = 0; i < followingButNotFollowingBackList.length; i++) {
                const row = table.insertRow(i + 1);

                const cell1 = row.insertCell(0);
                cell1.innerHTML = i + 1;
                cell1.classList.add('px-2', 'py-2', 'border', 'text-center');
                cell1.style.width = `${numberWidth + 2}ch`;

                const cell2 = row.insertCell(1);
                cell2.innerHTML = followingButNotFollowingBackList[i];
                cell2.classList.add('px-2', 'py-2', 'border', 'text-center');
                cell2.style.width = `${nameWidth}ch`;
            }

            const tableWrapper = document.createElement("div");
            const totalWidth = numberWidth + nameWidth + 6;
            tableWrapper.classList.add('p-6', 'bg-gray-50', 'shadow-md', 'rounded-md', 'border', 'border-gray-300', 'my-8', 'mx-auto');
            tableWrapper.style.width = `${totalWidth}ch`;
            tableWrapper.style.maxWidth = '100%';

            tableWrapper.appendChild(table);
            resultDiv.innerHTML = "";
            resultDiv.appendChild(tableWrapper);
        };

        rightReader.readAsText(rightFile);
    };

    reader.readAsText(leftFile);
}