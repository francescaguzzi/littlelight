#!/bin/bash

BACKUP_DIR="original_textures"

mkdir -p "$BACKUP_DIR"

echo "======================================"
echo "       GLTF TEXTURE OPTIMIZER"
echo "======================================"
echo

for file in *.{jpg,jpeg,png,tga}; do

    [ -f "$file" ] || continue

    dimensions=$(identify -format "%w %h" "$file" 2>/dev/null)

    if [ -z "$dimensions" ]; then
        echo "ERRORE: impossibile leggere $file"
        continue
    fi

    width=$(echo "$dimensions" | awk '{print $1}')
    height=$(echo "$dimensions" | awk '{print $2}')

    max=$width
    [ "$height" -gt "$max" ] && max=$height

    echo "$file : ${width}x${height}"

    # Backup
    if [ ! -f "$BACKUP_DIR/$file" ]; then
        cp "$file" "$BACKUP_DIR/$file"
    fi

    # --------------------------------------
    # aaa8k -> massimo 2048
    # --------------------------------------

    if [ "$file" = "aaa8k.jpg" ]; then

        if [ "$max" -gt 2048 ]; then
            echo "  -> aaa8k: 2048"

            magick "$file" \
                -resize '2048x2048>' \
                -quality 90 \
                "${file}.tmp"

            mv "${file}.tmp" "$file"
        else
            echo "  -> invariata"
        fi

    # --------------------------------------
    # Vegetazione -> massimo 512
    # --------------------------------------

    elif [[ "$file" == branch-* ||
            "$file" == shrubbery* ||
            "$file" == flowers-* ||
            "$file" == tinalb.* ||
            "$file" == "tin norm".* ||
            "$file" == tinroug.* ||
            "$file" == Gemini_Generated_Image* ||
            "$file" == Plant_Diffuse01.* ||
            "$file" == bark.* ]]; then

        if [ "$max" -gt 512 ]; then
            echo "  -> vegetazione: 512"

            magick "$file" \
                -resize '512x512>' \
                "${file}.tmp"

            mv "${file}.tmp" "$file"
        else
            echo "  -> invariata"
        fi

    # --------------------------------------
    # Iron Bench + Manhole -> 512
    # --------------------------------------

    elif [[ "$file" == Iron_Bench_Bake1_PBR_* ||
            "$file" == ManholeCover05_2K_* ]]; then

        if [ "$max" -gt 512 ]; then
            echo "  -> materiale: 512"

            magick "$file" \
                -resize '512x512>' \
                "${file}.tmp"

            mv "${file}.tmp" "$file"
        else
            echo "  -> invariata"
        fi

    # --------------------------------------
    # Tutte le altre -> massimo 1024
    # --------------------------------------

    elif [ "$max" -gt 1024 ]; then

        echo "  -> 1024"

        magick "$file" \
            -resize '1024x1024>' \
            -quality 90 \
            "${file}.tmp"

        mv "${file}.tmp" "$file"

    else
        echo "  -> invariata"
    fi

    echo

done

echo "======================================"
echo "             COMPLETATO"
echo "======================================"
echo
echo "Backup:"
echo "  $BACKUP_DIR/"
echo
